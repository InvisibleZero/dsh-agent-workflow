// @ts-nocheck
/**
 * 工作流的硬机制：写操作门禁 + 三个模型专用工具。
 *
 * 为什么不是提示词：状态机是硬约束，文字约束不住模型。这里用 DSH 现成能力把约束做成机制：
 *   1) `tools.guard(fn)`：派发前执行，返回理由即拒绝，理由会作为错误结果回给模型；
 *   2) `tools.register(def, { when })`：只在工作流会话里出现，不污染标准模式。
 *
 * 策略（2026-11-11 定稿）：
 *   - 只有「讨论中」禁止改代码；实现中 / 验收中 / 已完结都放行。
 *   - 手册与勾选走专用工具，不经过 write，因此不受门禁影响。
 *   - 「分步绝对」落在推进前置上：方案没写不能进实现中，清单没勾完不能进验收中。
 */
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { VERIFY_CHECKS, verifyMarkSymbol } from '../schema/verify-checks';
import { describePendingItems, resolveVerifyCheckId, summarizeVerification, validateVerifyReportInput } from '../engine/verify-rules';
import { logEvent } from './event-log';
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
    return `当前状态是「讨论中」，不允许执行 ${toolName}：讨论阶段只出方案、不改代码。先调用 workflow_advance({ to: "implementing" }) 推进到「实现中」（需要先把方案写进会话手册），或请用户点状态胶囊的 →。`;
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
/** 注册三个模型专用工具：推进 / 写手册 / 勾选清单。 */
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
        // —— 1. 推进状态 ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_advance',
            description: 'Request a stage change for this workflow session. This tool does NOT change the stage: it validates the preconditions and leaves a request the user must approve in the session UI (a 同意 / 拒绝 control appears next to the state badge). Call it when the user agrees to move on: 讨论中→实现中 before writing any code (the session manual must contain a plan), 实现中→验收中 when every checklist item is checked. Only available in sessions using the workflow preset. When wrapping up (reaching 已完结 or ending a session), write the four takeaways into 项目手册 via workflow_manual: ① new or overturned decisions (决策记录) ② pitfalls as 现象 → 根因 → 防线 → 自查 (坑与防线) ③ write 「无」 if neither ④ whether the docs still match the implementation, and what you changed if not; then sync 会话手册 (方案 / 实施顺序).',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['to'],
                properties: {
                    to: {
                        type: 'string',
                        enum: ['discussing', 'implementing', 'verifying', 'completed'],
                        description: 'Requested stage. Forward = normal progression; backward = rework.',
                    },
                    reason: {
                        type: 'string',
                        description: 'Required when moving backward (rework): why the previous stage was insufficient.',
                    },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['requested', 'status', 'message'],
                    properties: {
                        requested: { type: 'string' },
                        status: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
                render: (_args, value) => [
                    { type: 'text', text: `已请求切换到「${labelOf(value.requested)}」，等待用户确认。` },
                ],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_advance', sessionId, async () => {
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
                    logEvent(ctx.logger, 'info', `[workflow] advance requested (session=${sessionId}, ${from}→${to}${backward ? ', rework' : ''})`);
                    return {
                        requested: to,
                        status: 'awaiting-approval',
                        message: `已请求从「${labelOf(from)}」切换到「${labelOf(to)}」，等待用户在会话里确认；同意之前状态不会变。`,
                    };
                });
            },
        }, { when: whenWorkflow }));
        // —— 2. 读写手册（会话手册 / 项目手册）——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_manual',
            description: 'Read or update this workflow session\'s manual. target=session edits 会话手册 (writable section: 方案); target=project edits 项目手册 (writable sections: 项目总览 / 决策记录 / 约束 / 坑与防线). Replaces one section body only — headings and other sections are preserved, and the 实施顺序 checklist cannot be edited here (use workflow_check). Section bodies are capped by character count (约束 300, 方案 1200, 会话手册整本 2000; checklist evidence 「｜ 自检：」 is not counted) — over-limit writes are rejected with current / limit / over numbers, so trim before retrying. Allowed in every stage.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['target', 'action'],
                properties: {
                    target: { type: 'string', enum: ['session', 'project'], description: 'Which manual to touch.' },
                    action: {
                        type: 'string',
                        enum: ['read', 'replace_section', 'append_entry', 'update_entry', 'remove_entry', 'rename_tag'],
                        description: 'read returns text; replace_section rewrites a whole section (session 方案 / project 标签表); append_entry / update_entry / remove_entry write ONE tagged entry into a project section; rename_tag merges or renames a tag and rewrites every entry that uses it.',
                    },
                    section: { type: 'string', description: 'Section name (e.g. 方案 / 项目总览 / 决策记录 / 约束 / 坑与防线 / 标签表).' },
                    content: { type: 'string', description: 'Entry text (append_entry / update_entry) or new section body (replace_section).' },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Required for append_entry / update_entry: 1+ tags, each ≤12 chars, no brackets or ｜. Pick from the injected 标签表 (or a real file name in this project); unknown tags get registered automatically until the table is full.',
                    },
                    entry: { type: 'string', description: 'update_entry / remove_entry: exact body text of the existing entry (without its [tags] prefix).' },
                    from: { type: 'string', description: 'rename_tag: the tag to replace.' },
                    to: { type: 'string', description: 'rename_tag: the tag to keep. Use this to merge synonyms when 标签表 is full.' },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['ok'],
                    properties: {
                        ok: { type: 'boolean' },
                        text: { type: 'string' },
                        bytes: { type: 'integer' },
                        section: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                        registered: { type: 'array', items: { type: 'string' } },
                        entry: { type: 'string' },
                        rewritten: { type: 'integer' },
                        removed: { type: 'string' },
                    },
                },
                render: (args, value) => {
                    if (args?.action === 'read')
                        return [{ type: 'text', text: `手册共 ${value.text?.length ?? 0} 字` }];
                    if (args?.action === 'rename_tag')
                        return [{ type: 'text', text: `已合并标签，改写 ${value.rewritten ?? 0} 条` }];
                    if (args?.action === 'remove_entry')
                        return [{ type: 'text', text: '已删除一条' }];
                    if (args?.action === 'append_entry' || args?.action === 'update_entry') {
                        const registered = Array.isArray(value.registered) && value.registered.length > 0
                            ? `，新登记标签：${value.registered.join(' / ')}`
                            : '';
                        return [{ type: 'text', text: `已写入「${value.section}」一条${registered}` }];
                    }
                    return [{ type: 'text', text: `已更新「${value.section}」小节（${value.bytes} 字节）` }];
                },
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_manual', sessionId, async () => {
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
                                logEvent(ctx.logger, 'info', `[workflow] manual entry appended (session=${sessionId}, section=${section}, table=${written.tags.length}, registered=${written.registered.length})`);
                                return { ok: true, section, entry: written.entry, tags: written.tags, registered: written.registered };
                            }
                            if (action === 'update_entry') {
                                const written = await deps.repository.updateProjectEntry({
                                    workflowId: found.workflowId, section, entry, tags, content: String(args?.content ?? ''),
                                });
                                logEvent(ctx.logger, 'info', `[workflow] manual entry updated (session=${sessionId}, section=${section}, tags=${written.tags.length})`);
                                return { ok: true, section, entry: written.entry, tags: written.tags };
                            }
                            if (action === 'remove_entry') {
                                const removed = await deps.repository.removeProjectEntry({ workflowId: found.workflowId, section, entry });
                                logEvent(ctx.logger, 'info', `[workflow] manual entry removed (session=${sessionId}, section=${section})`);
                                return { ok: true, section, removed: removed.removed };
                            }
                            const from = String(args?.from ?? '');
                            const to = String(args?.to ?? '');
                            const renamed = await deps.repository.renameProjectTag({ workflowId: found.workflowId, from, to });
                            logEvent(ctx.logger, 'info', `[workflow] manual tag renamed (session=${sessionId}, from=${from}, to=${to}, rewritten=${renamed.rewritten}, table=${renamed.tags.length})`);
                            return { ok: true, tags: renamed.tags, rewritten: renamed.rewritten };
                        }
                        catch (error) {
                            // 被标签规则拒（缺标签 / 表满 / 匹配不到）也是"正常拒绝"：单独记一条，别和程序错混在一起。
                            logEvent(ctx.logger, 'warn', `[workflow] manual entry rejected (session=${sessionId}, action=${action}, section=${section}): ${String(error?.message ?? error)}`);
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
                            logEvent(ctx.logger, 'warn', `[workflow] manual gate rejected (session=${sessionId}, target=${target}, section=${section}): ${String(error?.message ?? error)}`);
                        }
                        throw error;
                    }
                    logEvent(ctx.logger, 'info', `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes}, chars=${result.chars})`);
                    return { ok: true, bytes: result.bytes, section };
                });
            },
        }, { when: whenWorkflow }));
        // —— 3. 勾选实施顺序 ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_check',
            description: 'Check or uncheck ONE item in this workflow session\'s 实施顺序 checklist. The item text must match an existing line exactly — this tool never adds, rewords, or reorders items. Checking an item REQUIRES evidence: say how you verified this layer and what the result was; the evidence is written into the checklist line. Every item must be checked (with evidence) before the session can move to 验收中. Not available in 讨论中.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['item', 'done'],
                properties: {
                    item: { type: 'string', description: 'Exact text of an existing checklist item.' },
                    done: { type: 'boolean', description: 'true = checked, false = unchecked.' },
                    evidence: { type: 'string', description: '勾选时必填：这一层怎么验的、结果是什么（自由文本，例：跑 node test.mjs，12 项全过）。取消勾选可省略。' },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['items'],
                    properties: {
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['label', 'done'],
                                properties: {
                                    label: { type: 'string' },
                                    done: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
                render: (_args, value) => [
                    { type: 'text', text: `清单进度：${value.items.filter((item) => item.done).length}/${value.items.length}` },
                ],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_check', sessionId, async () => {
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
                });
            },
        }, { when: whenWorkflow }));
        // —— 4. 提交验收报备（七项中的一项） ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_verify_report',
            description: 'Submit a verification report for ONE of the seven 验收项 in the 「验收中」 stage. The report must carry evidence anchors (file paths inside the workflow working directory, optional line numbers) — the program checks they exist, then sets the mark: result "pass" → ✓, result "deferred" (found a problem but decided not to fix it this round) → ？. A deferred report REQUIRES findings (location / problem / why_not_fixed / impact). Without a report an item can never leave ○. Every entry into 「验收中」 starts a new round: old reports expire automatically, so re-verification must re-report. Not available outside 「验收中」.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['item', 'result', 'summary', 'anchors'],
                properties: {
                    item: { type: 'string', description: '验收项：id 1-7 或名称（例：3 或「死代码扫描」）' },
                    result: { type: 'string', enum: ['pass', 'deferred'], description: 'pass = 通过；deferred = 查出问题但本轮不修（记 ？）' },
                    summary: { type: 'string', description: '结论摘要：做了什么、看到什么结果。' },
                    anchors: {
                        type: 'array',
                        description: '证据锚点，至少一条；文件必须在工作目录内。',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['file'],
                            properties: {
                                file: { type: 'string', description: '工作目录内的相对路径' },
                                line: { type: 'number', description: '可选行号；程序会核对它不超过文件行数' },
                            },
                        },
                    },
                    command: { type: 'string', description: '复跑命令；契约测试 / 边界测试 / 回归压测三项必填。' },
                    findings: {
                        type: 'array',
                        description: 'deferred 时必填：每条写清 位置 / 问题 / 为什么不修 / 影响什么。',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['location', 'problem', 'why_not_fixed', 'impact'],
                            properties: {
                                location: { type: 'string' },
                                problem: { type: 'string' },
                                why_not_fixed: { type: 'string' },
                                impact: { type: 'string' },
                            },
                        },
                    },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['item', 'progress'],
                    properties: {
                        item: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['id', 'name', 'mark'],
                            properties: {
                                id: { type: 'number' },
                                name: { type: 'string' },
                                mark: { type: 'string' },
                            },
                        },
                        progress: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['pass', 'deferred', 'pending', 'total'],
                            properties: {
                                pass: { type: 'number' },
                                deferred: { type: 'number' },
                                pending: { type: 'number' },
                                total: { type: 'number' },
                            },
                        },
                    },
                },
                render: (_args, value) => [
                    {
                        type: 'text',
                        text: `验收项 ${value.item.id} ${value.item.name} → ${verifyMarkSymbol(value.item.mark)}`
                            + `（通过 ${value.progress.pass} / 问询 ${value.progress.deferred} / 待处理 ${value.progress.pending}）`,
                    },
                ],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_verify_report', sessionId, async () => {
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
                    logEvent(ctx.logger, 'info', `[workflow] verify report (session=${sessionId}, item=${itemId}, mark=${item?.mark ?? 'pending'}, round=${state.round}, pending=${progress.pending})`);
                    return {
                        item: { id: itemId, name: check.name, mark: item?.mark ?? 'pending' },
                        progress: {
                            pass: progress.pass,
                            deferred: progress.deferred,
                            pending: progress.pending,
                            total: progress.total,
                        },
                    };
                });
            },
        }, { when: whenWorkflow }));
        // —— 5. 取消验收标记（AI 只能取消，不能直接打勾） ——
        toolCtx.effect(() => toolCtx.tools.register({
            name: 'workflow_verify_check',
            description: 'Uncheck ONE item of the 验收七项 checklist (done=false only). AI has no permission to check an item directly: a mark can only be produced by workflow_verify_report. done=true is always rejected — if the item needs to be re-marked, submit a new report. Not available outside 「验收中」.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['item', 'done'],
                properties: {
                    item: { type: 'string', description: '验收项：id 1-7 或名称' },
                    done: { type: 'boolean', description: '只能是 false（取消勾）。传 true 会被拒。' },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['item', 'progress'],
                    properties: {
                        item: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['id', 'mark'],
                            properties: {
                                id: { type: 'number' },
                                mark: { type: 'string' },
                            },
                        },
                        progress: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['pass', 'deferred', 'pending', 'total'],
                            properties: {
                                pass: { type: 'number' },
                                deferred: { type: 'number' },
                                pending: { type: 'number' },
                                total: { type: 'number' },
                            },
                        },
                    },
                },
                render: (_args, value) => [
                    { type: 'text', text: `验收项 ${value.item.id} 已取消（现为 ${verifyMarkSymbol(value.item.mark)}）` },
                ],
            },
            execute: async (args, exec) => {
                const sessionId = requireSession(deps, exec);
                return instrument('workflow_verify_check', sessionId, async () => {
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
                    logEvent(ctx.logger, 'info', `[workflow] verify cancel (session=${sessionId}, item=${itemId}, round=${state.round}, pending=${progress.pending})`);
                    return {
                        item: { id: itemId, mark: item.mark },
                        progress: {
                            pass: progress.pass,
                            deferred: progress.deferred,
                            pending: progress.pending,
                            total: progress.total,
                        },
                    };
                });
            },
        }, { when: whenWorkflow }));
    });
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
            throw new Error('会话手册的「方案」还是空的：先用 workflow_manual({ target: "session", action: "replace_section", section: "方案", content: "..." }) 写入方案，再推进到「实现中」。');
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