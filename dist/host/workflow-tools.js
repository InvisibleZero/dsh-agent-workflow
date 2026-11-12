// @ts-nocheck
/**
 * 工作流的硬机制：写操作门禁 + 工具网关（两个模型工具）。
 *
 * 为什么是网关：模型不再直接看到 5 个基础工具，只能：
 *   1) `workflow_tool_call`：按目录里的名字调用，目录外 / 阶段不符 / 参数不符一律拒；
 *   2) `workflow_tool_add`：把基础工具 + 固定参数登记成别名，只写目录、不执行。
 *
 * 判定全部走 engine/tool-policy 的纯函数；这里只做「取数据 → 判定 → 执行 → 记账」。
 *
 * 策略（2026-11-13 定稿）：
 *   - 只有「讨论中」禁止宿主写工具；实现中 / 验收中 / 已完结放行。
 *   - 手册与勾选走网关，不经过 write，因此不受门禁影响。
 *   - 「分步绝对」落在推进前置上：方案没写不能进实现中，清单没勾完不能进验收中。
 */
import { randomUUID } from 'node:crypto';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { VERIFY_CHECKS, verifyMarkSymbol } from '../schema/verify-checks';
import { describePendingItems, resolveVerifyCheckId, summarizeVerification, validateVerifyReportInput } from '../engine/verify-rules';
import { logEvent } from './event-log';
import { BASE_TOOL_NAMES, BASE_TOOLS } from '../schema/tool-catalog';
import { decideToolCall, mergeArgs, mergeCatalog, summarizeArgs, validateAliasInput } from '../engine/tool-policy';
/** 会被门禁拦的"动手"类工具。 */
const SIDE_EFFECT_TOOLS = new Set(['write', 'edit', 'apply_patch', 'pwsh', 'bash', 'notebook']);
/** 合法状态迁移表（客户端「返工」菜单是它的展示子集，两边都要能走通）。 */
const ALLOWED_TRANSITIONS = {
    discussing: ['implementing'],
    implementing: ['verifying', 'discussing'],
    verifying: ['completed', 'implementing', 'discussing'],
    completed: ['verifying', 'implementing', 'discussing'],
};
const STATE_ORDER = ['discussing', 'implementing', 'verifying', 'completed'];
/** 允许 AI 通过 workflow_manual 改的小节；「实施顺序」只在讨论中可定义，之后只能勾选。 */
const WRITABLE_SECTIONS = {
    session: ['方案', '实施顺序'],
    project: ['项目总览', '决策记录', '约束', '坑与防线', '标签表'],
};
function labelOf(state) {
    return NODE_STATE_LABEL[state] ?? state;
}
/** 拒绝理由：只有「讨论中」拦写操作。 */
function denialFor(state, toolName) {
    if (state !== 'discussing')
        return undefined;
    return `当前状态是「讨论中」，不允许执行 ${toolName}：讨论阶段只出方案、不改代码。先调用 workflow_tool_call({ name: "workflow_advance", args: { to: "implementing" } }) 推进到「实现中」（需要先把方案写进会话手册），或请用户点状态胶囊的 →。`;
}
/** 注册门禁：只在「讨论中」拦截写操作。 */
export function registerWorkflowGuard(ctx, deps) {
    ctx.inject(['tools'], (toolCtx) => {
        toolCtx.effect(() => toolCtx.tools.guard((exec) => {
            const sessionId = exec?.agent?.session?.id;
            if (!deps.isPresetSession(sessionId))
                return undefined;
            const toolName = String(exec?.name ?? '');
            if (!SIDE_EFFECT_TOOLS.has(toolName))
                return undefined;
            const state = deps.getState(sessionId);
            if (state === undefined) {
                // 状态表缺这一条（认领发生在节点绑定之前 / 宿主刚重启）时**默认拦住**：
                // 放行等于"讨论中也能改代码"，漏拦比误拦危险。同时排一次回填，重试即可恢复。
                void deps.refreshState?.(sessionId);
                logEvent(ctx.logger, 'warn', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=unknown)`);
                return `当前会话的工作流状态还没同步好（状态表缺这一条），为防绕过阶段限制，先拦住这次写操作。已触发同步，请重试一次；若反复出现，说明这个会话还没绑定 workflow 节点。`;
            }
            const reason = denialFor(state, toolName);
            if (reason !== undefined) {
                logEvent(ctx.logger, 'info', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
            }
            return reason;
        }));
    });
}
/**
 * 注册两个模型工具：网关调用与别名申请。
 *
 * 两个工具都只在工作流会话里出现（`when`），不污染标准模式。
 */
export function registerWorkflowTools(ctx, deps) {
    ctx.inject(['tools'], (toolCtx) => {
        const whenWorkflow = (context) => deps.isPresetSession(context?.agent?.session?.id);
        /** 统一的工具埋点：成功/失败各一条，带耗时与会话，失败直接抛回模型。 */
        const instrument = async (toolName, sessionId, run) => {
            const startedAt = Date.now();
            try {
                const value = await run();
                logEvent(ctx.logger, 'info', `[workflow] tool ${toolName} ok (session=${sessionId}, ${Date.now() - startedAt}ms)`);
                return value;
            }
            catch (error) {
                const message = String(error?.message ?? error);
                logEvent(ctx.logger, 'warn', `[workflow] tool ${toolName} failed (session=${sessionId}, ${Date.now() - startedAt}ms): ${message}`);
                throw error;
            }
        };
        const record = (input) => deps.recordToolEvent?.(input);
        // —— 1. 调用目录里的工具（模型唯一的调用入口） ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_tool_call',
            description: '调用工具目录里的工具：name 是目录里的工具名，args 是它的参数。目录在系统提示里（基础 5 个 + 本工作区登记的别名）。'
                + '目录外名字、当前阶段不可用、参数不符、覆盖固定参数都会被拒，拒绝理由会原样返回；新增工具用 workflow_tool_add。',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'args'],
                properties: {
                    name: { type: 'string', description: '目录里的工具名（例：workflow_manual / workflow_verify_report / 别名）。' },
                    args: { type: 'object', description: '该工具的参数对象；按目录里的必填项与参数说明传。', additionalProperties: true },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['ok', 'name', 'base_tool', 'value'],
                    properties: {
                        ok: { type: 'boolean' },
                        name: { type: 'string' },
                        base_tool: { type: 'string' },
                        value: { type: 'object' },
                    },
                },
                render: (_args, value) => [{
                        type: 'text',
                        text: `已调用 ${value.name}${value.value?.message ? `：${value.value.message}` : ''}`,
                    }],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_tool_call', sessionId, async () => {
                    const found = await deps.repository.findBySession(sessionId);
                    if (found === null)
                        throw new Error('当前会话还没有 workflow 节点');
                    const name = typeof args?.name === 'string' ? args.name : '';
                    const { catalog } = await loadCatalog(deps, found.workflowId);
                    const state = await currentStateOf(deps, sessionId);
                    const startedAt = Date.now();
                    const entry = catalog.find((item) => item.name === name);
                    if (entry === undefined) {
                        const message = `工具目录里没有「${name}」：只能调用目录里的工具；要新增请用 workflow_tool_add。`;
                        record({
                            kind: 'call', session: sessionId, workflow_id: found.workflowId, name,
                            decision: 'deny', code: 'unknown-tool', state, args: summarizeArgs(args?.args), message,
                        });
                        throw new Error(message);
                    }
                    const decision = decideToolCall({ state, entry, args: args?.args });
                    if (!decision.allow) {
                        record({
                            kind: 'call', session: sessionId, workflow_id: found.workflowId, name,
                            base_tool: entry.base_tool, decision: 'deny', code: decision.code, state,
                            args: summarizeArgs(args?.args), message: decision.message,
                        });
                        throw new Error(decision.message);
                    }
                    const merged = mergeArgs(entry.fixed_args, args?.args);
                    let value;
                    try {
                        value = await invokeBaseTool(deps, entry.base_tool, merged, sessionId);
                    }
                    catch (error) {
                        const message = String(error?.message ?? error);
                        record({
                            kind: 'call', session: sessionId, workflow_id: found.workflowId, name,
                            base_tool: entry.base_tool, decision: 'error', code: 'execution-failed', state,
                            args: summarizeArgs(args?.args), ms: Date.now() - startedAt, message,
                        });
                        throw error;
                    }
                    record({
                        kind: 'call', session: sessionId, workflow_id: found.workflowId, name,
                        base_tool: entry.base_tool, decision: 'allow', state,
                        args: summarizeArgs(args?.args), ms: Date.now() - startedAt,
                    });
                    return { ok: true, name: entry.name, base_tool: entry.base_tool, value };
                });
            },
        }, { when: whenWorkflow }));
        // —— 2. 申请登记一个别名（只写目录，不执行） ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_tool_add',
            description: '登记一个新的工具别名（模型只有申请权，没有直接注册权）：只能把五个基础工具之一加上固定参数，不能挂别名（禁止链式）。'
                + '登记时自动过四关：基础工具白名单、名字/描述/固定参数/阶段继承的静态校验、sample_args 参数校验、副作用继承；'
                + '全过就写入本工作区目录、立即可用，不执行任何业务。只能在讨论中 / 实现中登记；验收中 / 已完结会被拒。',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description', 'base_tool', 'sample_args'],
                properties: {
                    name: { type: 'string', description: '新工具名：3~41 位小写字母/数字/下划线，以字母开头（例：note_decision）。' },
                    description: { type: 'string', description: '一句话说明：做什么、什么时候用（≤200 字）。' },
                    base_tool: {
                        type: 'string',
                        enum: BASE_TOOL_NAMES,
                        description: '基础工具：别名只能在它们之上加固定参数。',
                    },
                    fixed_args: { type: 'object', description: '预置参数：调用时不能再传这些键。', additionalProperties: true },
                    allowed_states: {
                        type: 'array',
                        items: { type: 'string', enum: ['discussing', 'implementing', 'verifying', 'completed'] },
                        description: '可选：收窄可用阶段，必须是基础工具允许阶段的子集；不传则继承全部。',
                    },
                    sample_args: { type: 'object', description: '必填：一个能跑通的示例参数（不含固定参数），登记时用它校验参数形状。', additionalProperties: true },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['ok', 'entry', 'message'],
                    properties: {
                        ok: { type: 'boolean' },
                        entry: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['name', 'base_tool', 'allowed_states', 'version'],
                            properties: {
                                name: { type: 'string' },
                                base_tool: { type: 'string' },
                                allowed_states: { type: 'array', items: { type: 'string' } },
                                version: { type: 'number' },
                            },
                        },
                        message: { type: 'string' },
                    },
                },
                render: (_args, value) => [{
                        type: 'text',
                        text: `已登记「${value.entry?.name ?? '?'}」→ ${value.entry?.base_tool ?? '?'}，现在可以通过 workflow_tool_call 调用。`,
                    }],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_tool_add', sessionId, async () => {
                    const found = await deps.repository.findBySession(sessionId);
                    if (found === null)
                        throw new Error('当前会话还没有 workflow 节点');
                    const state = await currentStateOf(deps, sessionId);
                    if (state !== 'discussing' && state !== 'implementing') {
                        const message = `当前状态「${labelOf(state)}」不能新增工具：工具变更会污染验收结论，等回到讨论中 / 实现中再登记。`;
                        record({
                            kind: 'add', session: sessionId, workflow_id: found.workflowId, name: String(args?.name ?? ''),
                            decision: 'deny', code: 'stage-denied', state, message,
                        });
                        throw new Error(message);
                    }
                    const listing = await deps.aliasStore.list(found.workflowId);
                    if (listing.corrupt) {
                        logEvent(deps.logger, 'warn', `[workflow] alias store corrupt (workflow=${found.workflowId})：别名不可用，基础工具不受影响`);
                    }
                    const validation = validateAliasInput({
                        name: args?.name,
                        description: args?.description,
                        baseTool: args?.base_tool,
                        fixedArgs: args?.fixed_args,
                        allowedStates: args?.allowed_states,
                        sampleArgs: args?.sample_args,
                        existingNames: [...BASE_TOOL_NAMES, ...listing.aliases.map((entry) => entry.name)],
                    });
                    const requestedName = String(args?.name ?? '').trim();
                    if (!validation.ok) {
                        record({
                            kind: 'add', session: sessionId, workflow_id: found.workflowId, name: requestedName,
                            base_tool: String(args?.base_tool ?? ''), decision: 'deny', code: validation.code, state,
                            message: validation.message,
                        });
                        throw new Error(validation.message);
                    }
                    const fixedArgs = isPlainRecord(args?.fixed_args) ? args.fixed_args : {};
                    const entry = {
                        tool_id: randomUUID(),
                        name: requestedName,
                        description: String(args.description).trim(),
                        base_tool: String(args.base_tool),
                        fixed_args: fixedArgs,
                        allowed_states: validation.allowedStates,
                        created_at: new Date().toISOString(),
                        version: 1,
                    };
                    await deps.aliasStore.add(found.workflowId, entry);
                    record({
                        kind: 'add', session: sessionId, workflow_id: found.workflowId, name: entry.name,
                        base_tool: entry.base_tool, decision: 'allow', state,
                        args: summarizeArgs({ fixed_args: fixedArgs }), ms: Date.now(),
                    });
                    // 目录变了：下一轮系统提示要立刻带上新别名。
                    await deps.stateContext?.refreshNow?.(sessionId);
                    const required = validation.parameters.required ?? [];
                    return {
                        ok: true,
                        entry: { name: entry.name, base_tool: entry.base_tool, allowed_states: entry.allowed_states, version: entry.version },
                        message: `已登记「${entry.name}」→ ${entry.base_tool}；调用时必填：${required.length > 0 ? required.join(',') : '无'}。`,
                    };
                });
            },
        }, { when: whenWorkflow }));
    });
}
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** 目录 = 基础 5 条 + 本工作区别名；文件坏时只丢别名，基础工具照常。 */
async function loadCatalog(deps, workflowId) {
    const listing = await deps.aliasStore.list(workflowId);
    if (listing.corrupt) {
        logEvent(deps.logger, 'warn', `[workflow] alias store corrupt (workflow=${workflowId})：别名不可用，基础工具不受影响`);
    }
    return { catalog: mergeCatalog(BASE_TOOLS, listing.aliases), corrupt: listing.corrupt };
}
/** 取当前状态；缺条先补一次，补不到就明确拒绝（不能拿 undefined 当"允许"）。 */
async function currentStateOf(deps, sessionId) {
    let state = deps.getState(sessionId);
    if (state === undefined) {
        await deps.refreshState?.(sessionId);
        state = deps.getState(sessionId);
    }
    if (state === undefined) {
        throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）。已触发同步，请重试一次。');
    }
    return state;
}
/** 按基础工具名分发到实现函数：网关只做转发，不在这里写业务。 */
async function invokeBaseTool(deps, baseTool, args, sessionId) {
    switch (baseTool) {
        case 'workflow_advance': return invokeAdvance(deps, sessionId, args);
        case 'workflow_manual': return invokeManual(deps, sessionId, args);
        case 'workflow_check': return invokeCheck(deps, sessionId, args);
        case 'workflow_verify_report': return invokeVerifyReport(deps, sessionId, args);
        case 'workflow_verify_check': return invokeVerifyCheck(deps, sessionId, args);
        default: throw new Error(`未知的基础工具：${baseTool}`);
    }
}
/** 1. 推进状态：只登记请求，不改状态。 */
async function invokeAdvance(deps, sessionId, args) {
    const found = await deps.repository.findBySession(sessionId);
    if (found === null)
        throw new Error('当前会话还没有 workflow 节点');
    const from = String(found.current_state);
    const to = String(args?.to ?? '');
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new Error(`不能从「${labelOf(from)}」直接到「${labelOf(to)}」；当前可去：${allowed.map(labelOf).join(' / ')}`);
    }
    const backward = STATE_ORDER.indexOf(to) < STATE_ORDER.indexOf(from);
    if (backward && (typeof args?.reason !== 'string' || args.reason.trim() === '')) {
        throw new Error('返工需要 reason：说明上一阶段哪里不够');
    }
    await assertAdvanceAllowed(deps.repository, found, from, to);
    // 只登记请求，不改状态：切换由用户在界面上点「同意」完成。
    deps.requestAdvance({ sessionId, to, ...(typeof args?.reason === 'string' ? { reason: args.reason } : {}) });
    logEvent(deps.logger, 'info', `[workflow] advance requested (session=${sessionId}, ${from}→${to}${backward ? ', rework' : ''})`);
    return {
        requested: to,
        status: 'awaiting-approval',
        message: `已请求从「${labelOf(from)}」切换到「${labelOf(to)}」，等待用户在会话里确认；同意之前状态不会变。`,
    };
}
/** 2. 读写手册（会话手册 / 项目手册）。 */
async function invokeManual(deps, sessionId, args) {
    const found = await deps.repository.findBySession(sessionId);
    if (found === null)
        throw new Error('当前会话还没有 workflow 节点');
    const target = String(args?.target ?? '');
    if (target !== 'session' && target !== 'project')
        throw new Error('target 只能是 session 或 project');
    const action = String(args?.action ?? '');
    const nodeId = target === 'session' ? found.nodeId : null;
    if (action === 'read') {
        const text = await deps.repository.readManual(found.workflowId, nodeId);
        return { ok: true, text };
    }
    // —— 项目手册的条目级写口：一条一写，必须带标签 ——
    if (action === 'append_entry' || action === 'update_entry' || action === 'remove_entry' || action === 'rename_tag') {
        if (target !== 'project') {
            throw new Error('条目级写入只对项目手册（target=project）可用；会话手册用 replace_section 写方案');
        }
        const section = String(args?.section ?? '').trim();
        const tags = Array.isArray(args?.tags) ? args.tags.map((tag) => String(tag)) : [];
        const entry = String(args?.entry ?? '').trim();
        try {
            if (action === 'append_entry') {
                const written = await deps.repository.appendProjectEntry({
                    workflowId: found.workflowId, section, tags, content: String(args?.content ?? ''),
                });
                logEvent(deps.logger, 'info', `[workflow] manual entry appended (session=${sessionId}, section=${section}, table=${written.tags.length}, registered=${written.registered.length})`);
                return { ok: true, section, entry: written.entry, tags: written.tags, registered: written.registered };
            }
            if (action === 'update_entry') {
                const written = await deps.repository.updateProjectEntry({
                    workflowId: found.workflowId, section, entry, tags, content: String(args?.content ?? ''),
                });
                logEvent(deps.logger, 'info', `[workflow] manual entry updated (session=${sessionId}, section=${section}, tags=${written.tags.length})`);
                return { ok: true, section, entry: written.entry, tags: written.tags };
            }
            if (action === 'remove_entry') {
                const removed = await deps.repository.removeProjectEntry({ workflowId: found.workflowId, section, entry });
                logEvent(deps.logger, 'info', `[workflow] manual entry removed (session=${sessionId}, section=${section})`);
                return { ok: true, section, removed: removed.removed };
            }
            const from = String(args?.from ?? '');
            const to = String(args?.to ?? '');
            const renamed = await deps.repository.renameProjectTag({ workflowId: found.workflowId, from, to });
            logEvent(deps.logger, 'info', `[workflow] manual tag renamed (session=${sessionId}, from=${from}, to=${to}, rewritten=${renamed.rewritten}, table=${renamed.tags.length})`);
            return { ok: true, tags: renamed.tags, rewritten: renamed.rewritten };
        }
        catch (error) {
            // 被标签规则拒（缺标签 / 表满 / 匹配不到）也是"正常拒绝"：单独记一条，别和程序错混在一起。
            logEvent(deps.logger, 'warn', `[workflow] manual entry rejected (session=${sessionId}, action=${action}, section=${section}): ${String(error?.message ?? error)}`);
            throw error;
        }
    }
    if (action !== 'replace_section') {
        throw new Error('action 只能是 read / replace_section / append_entry / update_entry / remove_entry / rename_tag');
    }
    const section = String(args?.section ?? '').trim();
    const writable = WRITABLE_SECTIONS[target];
    if (!writable.includes(section)) {
        throw new Error(`「${target}」手册只能改这些小节：${writable.join(' / ')}；${section === '实施顺序' ? '清单请用 workflow_check 勾选。' : ''}`);
    }
    if (typeof args?.content !== 'string' || args.content.trim() === '')
        throw new Error('content 不能为空');
    // 「实施顺序」只在讨论中定义；进入实现中之后只能勾选，不能重排或改写条目。
    if (target === 'session' && section === '实施顺序') {
        // 状态表可能还没回填（认领早于绑节点）：先补一次，否则"讨论中"会被误判。
        if (deps.getState(sessionId) === undefined)
            await deps.refreshState?.(sessionId);
        const state = deps.getState(sessionId);
        if (state === undefined) {
            throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）：先让宿主完成认领，再定义实施顺序。');
        }
        if (state !== 'discussing') {
            throw new Error('「实施顺序」只能在「讨论中」定义；进入实现中之后请用 workflow_check 逐条勾选，不要改写条目。');
        }
    }
    let result;
    try {
        result = await deps.repository.replaceManualSection({ workflowId: found.workflowId, nodeId, section, content: args.content });
    }
    catch (error) {
        // 被字数闸门拒是一种"正常的拒绝"，不是程序错：单独记一条，排查时不必去猜参数错还是超限。
        if (error?.code === 'manual-limit') {
            logEvent(deps.logger, 'warn', `[workflow] manual gate rejected (session=${sessionId}, target=${target}, section=${section}): ${String(error?.message ?? error)}`);
        }
        throw error;
    }
    logEvent(deps.logger, 'info', `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes}, chars=${result.chars})`);
    return { ok: true, bytes: result.bytes, section };
}
/** 3. 勾选实施顺序。 */
async function invokeCheck(deps, sessionId, args) {
    const state = deps.getState(sessionId);
    if (state === undefined)
        await deps.refreshState?.(sessionId);
    const stateNow = deps.getState(sessionId);
    if (stateNow === 'discussing')
        throw new Error('「讨论中」还不勾清单：先把方案写进会话手册，推进到「实现中」再勾。');
    const found = await deps.repository.findBySession(sessionId);
    if (found === null)
        throw new Error('当前会话还没有 workflow 节点');
    const label = String(args?.item ?? '').trim();
    if (label === '')
        throw new Error('item 不能为空');
    const items = await deps.repository.setChecklistItem({
        workflowId: found.workflowId,
        nodeId: found.nodeId,
        label,
        done: args?.done === true,
        evidence: typeof args?.evidence === 'string' ? args.evidence : '',
    });
    return { items };
}
/** 4. 提交验收报备（七项中的一项）。 */
async function invokeVerifyReport(deps, sessionId, args) {
    const found = await requireVerifyingNode(deps, sessionId);
    const itemId = resolveVerifyCheckId(args?.item);
    const check = VERIFY_CHECKS.find((entry) => entry.id === itemId);
    if (check === undefined)
        throw new Error(`没有 ${itemId} 号验收项`);
    const report = validateVerifyReportInput(check, args);
    const { state } = await deps.repository.submitVerifyReport({
        workflowId: found.workflowId,
        nodeId: found.nodeId,
        itemId,
        report,
    });
    const progress = summarizeVerification(state);
    const item = state.items.find((entry) => entry.id === itemId);
    // 报备成功必须留「哪一项、什么标记、第几轮」：否则日志只能证明工具调过，
    // 答不上「这一项是刚被标上的，还是上一轮遗留的」——验收排查第一跳就断。
    logEvent(deps.logger, 'info', `[workflow] verify report (session=${sessionId}, item=${itemId}, mark=${item?.mark ?? 'pending'}, round=${state.round}, pending=${progress.pending})`);
    // 徽标上的 n/7 变了：推一次，别让页面等刷新才看见勾。
    deps.notify?.(sessionId, 'verify');
    return {
        item: { id: itemId, name: check.name, mark: item?.mark ?? 'pending' },
        progress: {
            pass: progress.pass,
            deferred: progress.deferred,
            pending: progress.pending,
            total: progress.total,
        },
    };
}
/** 5. 取消验收标记（AI 只能取消，不能直接打勾）。 */
async function invokeVerifyCheck(deps, sessionId, args) {
    if (args?.done !== false) {
        throw new Error('AI 不能直接打验收勾：先调用 workflow_verify_report 提交报备，标记由报备落。取消勾请传 done=false。');
    }
    const found = await requireVerifyingNode(deps, sessionId);
    const itemId = resolveVerifyCheckId(args?.item);
    const { state, item } = await deps.repository.cancelVerifyMark({
        workflowId: found.workflowId,
        nodeId: found.nodeId,
        itemId,
    });
    const progress = summarizeVerification(state);
    logEvent(deps.logger, 'info', `[workflow] verify cancel (session=${sessionId}, item=${itemId}, round=${state.round}, pending=${progress.pending})`);
    // 撤勾也改徽标，同样要推。
    deps.notify?.(sessionId, 'verify');
    return {
        item: { id: itemId, mark: item.mark },
        progress: {
            pass: progress.pass,
            deferred: progress.deferred,
            pending: progress.pending,
            total: progress.total,
        },
    };
}
/** 取当前会话，并确认它归本插件管。 */
function requireSession(deps, exec) {
    const sessionId = exec?.agent?.session?.id;
    if (typeof sessionId !== 'string' || sessionId === '')
        throw new Error('这个工具需要一个会话');
    if (!deps.isPresetSession(sessionId))
        throw new Error('这个工具只对「工作流模式」预设的会话可用');
    return sessionId;
}
/** 验收类工具的前置：必须在「验收中」，且能定位到节点。 */
async function requireVerifyingNode(deps, sessionId) {
    let state = deps.getState(sessionId);
    if (state === undefined) {
        await deps.refreshState?.(sessionId);
        state = deps.getState(sessionId);
    }
    if (state === undefined)
        throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）');
    if (state !== 'verifying') {
        throw new Error(`验收报备只能在「验收中」提交（当前是「${labelOf(state)}」）：先让用户推进到验收中。`);
    }
    const found = await deps.repository.findBySession(sessionId);
    if (found === null)
        throw new Error('当前会话还没有 workflow 节点');
    return found;
}
/** 推进前置：方案非空才能进实现中；清单全勾才能进验收中。工具与人工点击共用。 */
export async function assertAdvanceAllowed(repository, found, from, to) {
    if (to === 'implementing' && from === 'discussing') {
        const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
        if (meta === null || meta.hasPlan !== true) {
            throw new Error('会话手册的「方案」还是空的：先用 workflow_tool_call({ name: "workflow_manual", args: { target: "session", action: "replace_section", section: "方案", content: "..." } }) 写入方案，再推进到「实现中」。');
        }
    }
    if (to === 'verifying' && from === 'implementing') {
        const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
        const items = meta?.checklist ?? [];
        if (items.length === 0) {
            throw new Error('「实施顺序」里还没有条目：先用 workflow_manual 写入方案和实施顺序，再逐条用 workflow_check 勾选。');
        }
        const unchecked = items.filter((item) => item.done !== true);
        if (unchecked.length > 0) {
            throw new Error(`还有 ${unchecked.length} 条没勾完，不能进「验收中」：${unchecked.map((item) => item.label).join(' / ')}`);
        }
    }
    if (to === 'completed' && from === 'verifying') {
        const verification = await repository.getVerification(found.workflowId, found.nodeId);
        const summary = summarizeVerification(verification);
        if (!summary.complete) {
            throw new Error(`验收还有 ${summary.pending} 项没处理（${describePendingItems(verification)}）：逐项用 workflow_verify_report 报备`
                + '（pass 记 ✓，deferred 记 ？），全部处理完才能进「已完结」。');
        }
    }
}
//# sourceMappingURL=workflow-tools.js.map