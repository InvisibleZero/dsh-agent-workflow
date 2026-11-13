// @ts-nocheck
/**
 * 把 workflow 节点的上下文按层注入会话（系统提示里的动态上下文段，不写会话记录）。
 *
 * 通道选择：`systemPrompt.context()`。理由：每次装配重新求值，状态一变文本自然跟着变，
 * 不用"替换/作废旧消息"的记账，也不污染聊天记录。
 *
 * 分层：每层一个 context 槽位（各自 order + 各自预算），由 `assemblePromptLayers` 统一装配。
 * 之前是拼成一整块 8000 字节再截尾——谁写在后面谁先死，跟重要程度无关。
 *
 * 约束：context 的 text() 是同步求值，不能读盘，所以真实文本在 `agent/pre-step`
 * （异步）里算好放进缓存，text() 只读缓存。
 */
import { effectiveDetailParts } from '../engine/state-machine';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { DEFAULT_HARD_RULES } from '../schema/hard-rules';
import { VERIFY_CHECKS, verifyMarkSymbol } from '../schema/verify-checks';
import { summarizeVerification } from '../engine/verify-rules';
import { logEvent } from './event-log';
import { join } from 'node:path';
import { PROMPT_LAYER_SPECS, SESSION_MANUAL_BUDGET_BYTES, TAG_LAYER_BUDGET_BYTES, assemblePromptLayers, pickSessionManualParts, } from '../engine/prompt-layers';
import { countUtf8Bytes, truncateToBytes } from '../engine/text-budget';
export { truncateToBytes };
/** 整块注入的预算（字节）：A 公共细节常驻交付三项与提建议规范，且用户可把它改得更长，
 *  按默认文本最坏情况（验收中 + 满额会话手册）约 7.2 KB，预算 9000 留约 1.8 KB 余量；
 *  靠"分层 + 按重要度丢"解决挤占，不靠无限加预算。 */
const TOTAL_BUDGET_BYTES = 9000;
/**
 * 按字符截断（码点安全）。
 * 用于「约束 / 红线」这类有字数上限的小节：老手册可能超，超了要标出来而不是静默丢字。
 */
function clipChars(text, limit) {
    const chars = Array.from(text);
    if (chars.length <= limit)
        return { text, clipped: false };
    return { text: `${chars.slice(0, limit).join('')}…（已截断，全文见项目手册文件）`, clipped: true };
}
/**
 * 渲染「会话手册」这一层：方案全文 + 未勾清单。
 *
 * 自带降级：清单短、方案长，所以先保证清单装得下，剩下预算给方案；
 * 方案再超就按字节截断并标注（不重演"尾部 2000 字"那种反向取舍）。
 */
function renderSessionManual(input) {
    const head = `本会话手册（唯一真源）：${input.path}`;
    const listLines = input.totalItems === 0
        ? ['实施顺序：（还没写）']
        : [
            `实施顺序：未勾 ${input.unchecked.length} 条 / 共 ${input.totalItems} 条（已勾 ${input.checkedCount} 条不再重复注入）`,
            ...input.unchecked.map((label, index) => `${index + 1}. ${label}`),
        ];
    const listText = listLines.join('\n');
    const overhead = countUtf8Bytes(`${head}\n\n方案：\n\n\n${listText}`);
    const planBudget = Math.max(300, SESSION_MANUAL_BUDGET_BYTES - overhead);
    const rawPlan = input.plan.trim();
    const planText = rawPlan === '' ? '（还没写）' : truncateToBytes(rawPlan, planBudget);
    return {
        text: `${head}\n\n方案：\n${planText}\n\n${listText}`,
        planTruncated: rawPlan !== '' && planText !== rawPlan,
    };
}
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回合并后的文本。
 */
export function registerWorkflowStateContext(ctx, repository, 
/** 只有返回 true 的会话才注入；由宿主半按"这个会话是不是工作流预设"判定。 */
isWorkflowSession = () => true, 
/** 工具目录文本：按当前状态现算（基础 + 扩展，按状态过滤），不在这里读文件。 */
options) {
    /** sessionId -> 本轮各层文本（同步可读，供 systemPrompt.context 使用）。 */
    const cache = new Map();
    const pending = new Set();
    const clear = (sessionId, reason) => {
        cache.delete(sessionId);
        logEvent(ctx.logger, 'info', `[workflow] context cleared (session=${sessionId}, reason=${reason})`);
        return null;
    };
    const buildText = async (sessionId) => {
        const found = await repository.findBySession(sessionId);
        if (found === null || found === undefined)
            return clear(sessionId, 'no-node');
        const snapshot = await repository.get(found.workflowId);
        if (snapshot === null)
            return clear(sessionId, 'no-workflow');
        const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
        if (node === undefined)
            return clear(sessionId, 'no-node-in-snapshot');
        const global = await repository.getAppGlobalOperationDetail();
        // A（三态通用）与 B/C/D（本状态专属）分开取：两层各自挂载、各自预算。
        const detail = effectiveDetailParts(node.current_state, node, global);
        const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
        const header = [
            `节点：${node.title || '(未命名)'}　workflow：${snapshot.title}`,
            `当前状态：${label}`,
            '（阶段边界：只有「讨论中」会拦写操作；「验收中」「已完结」不拦写文件。改代码仍按阶段规则走，工具会返回该阶段的完整规则。）',
        ].join('\n');
        // 插件层硬规则：不随用户「操作细节」编辑，按当前状态追加（覆盖值优先，缺省用常量）。
        const hardOverride = (global && typeof global === 'object' ? global.hard_rules : undefined) ?? {};
        const hardRule = node.current_state === 'discussing'
            ? (hardOverride.discussing ?? DEFAULT_HARD_RULES.discussing)
            : node.current_state === 'implementing'
                ? (hardOverride.implementing ?? DEFAULT_HARD_RULES.implementing)
                : node.current_state === 'verifying'
                    ? (hardOverride.verifying ?? DEFAULT_HARD_RULES.verifying)
                    : '';
        // 节点级「附加说明」：全局附加 + 当前状态附加，合成一层（都属于"本节点特别要求"）。
        const nodeAdditional = typeof node.additional_detail === 'object' && node.additional_detail !== null
            ? node.additional_detail.global
            : undefined;
        const stateAddition = typeof node.additional_detail === 'object' && node.additional_detail !== null
            ? node.additional_detail[node.current_state]
            : undefined;
        const additionParts = [];
        if (typeof nodeAdditional === 'string' && nodeAdditional.trim() !== '')
            additionParts.push(nodeAdditional.trim());
        if (typeof stateAddition === 'string' && stateAddition.trim() !== '')
            additionParts.push(`本节点补充要求：${stateAddition.trim()}`);
        // 项目手册：只有「约束 / 红线」常驻；其余三节不注入，靠一句引导让模型自己去读文件。
        const limits = (await repository.getAppSettings()).manualLimits;
        const projectSections = await repository.readGlobalManualSections(found.workflowId);
        const constraints = clipChars(projectSections.constraints.trim(), limits.constraints_chars);
        if (constraints.clipped) {
            logEvent(ctx.logger, 'warn', `[workflow] constraints clipped (session=${sessionId}, limit=${limits.constraints_chars}字)`);
        }
        const projectManualPath = await repository.globalManualPath(found.workflowId);
        const cue = projectManualPath === null
            ? ''
            : [
                `项目手册：${projectManualPath}`,
                '（项目总览 / 决策记录 / 坑与防线不常驻系统提示：需要项目背景——为什么这么设计、踩过什么坑——时用文件读取工具读它，不要猜。）',
            ].join('\n');
        // 标签表：写项目手册条目时只能从这里选；空表不占预算。
        const rawTagsText = projectSections.tags.length === 0
            ? ''
            : `标签表（写项目手册条目时只能从这里选，也可以填项目里真实存在的文件名）：\n${projectSections.tags.join(' / ')}`;
        const tagsText = rawTagsText === '' ? '' : truncateToBytes(rawTagsText, TAG_LAYER_BUDGET_BYTES);
        if (tagsText !== rawTagsText) {
            // 截断后模型只看到半个词表，可能选不到该选的标签：必须留痕，不然排查时以为表里没有。
            logEvent(ctx.logger, 'warn', `[workflow] tag layer truncated (session=${sessionId}, tags=${projectSections.tags.length}, bytes=${countUtf8Bytes(tagsText)})`);
        }
        // 验收七项：只在「验收中」注入（其它状态没有这块清单，别占预算）。
        let verifyProgress = '';
        if (node.current_state === 'verifying') {
            const verification = await repository.getVerification(found.workflowId, found.nodeId);
            const progress = summarizeVerification(verification);
            const lines = [
                `【验收七项】通过 ${progress.pass} / 问询 ${progress.deferred} / 待处理 ${progress.pending}（共 ${progress.total}）`,
                ...verification.items.map((item) => {
                    const definition = VERIFY_CHECKS.find((check) => check.id === item.id);
                    const tail = item.mark === 'deferred' && item.report !== null ? `：${item.report.summary}` : '';
                    return `${verifyMarkSymbol(item.mark)} ${item.id} ${definition?.name ?? ''}${tail}`.trim();
                }),
                '（✓ = 已报备通过；？ = 查出问题本轮不修；○ = 还没报备。报备用 workflow_verify_report，七项全非 ○ 才能进「已完结」。）',
            ];
            verifyProgress = lines.join('\n');
        }
        // 会话手册：方案全文 + 未勾清单（不再取"尾部 2000 字"）。
        const manualData = await repository.readNodeManual(found.workflowId, found.nodeId);
        let sessionManual = '';
        if (manualData !== null) {
            const parts = pickSessionManualParts(manualData.manual);
            const rendered = renderSessionManual({
                path: join(manualData.notesDir, `会话手册-${found.nodeId}.md`),
                plan: parts.plan,
                unchecked: parts.unchecked,
                checkedCount: parts.checkedCount,
                totalItems: parts.totalItems,
            });
            if (rendered.planTruncated) {
                logEvent(ctx.logger, 'warn', `[workflow] session plan truncated (session=${sessionId}, bytes>${SESSION_MANUAL_BUDGET_BYTES})`);
            }
            sessionManual = rendered.text;
        }
        // 工具目录：模型不再原生看到 5 个工具，靠这一层知道「有哪些工具、怎么调」。
        // 读工具表失败不能把整轮注入拖垮：目录缺了就退回只剩基础工具，并在事件里留痕。
        let toolCatalog = '';
        if (typeof options?.catalogTextOf === 'function') {
            try {
                toolCatalog = await options.catalogTextOf(node.current_state);
            }
            catch (error) {
                logEvent(ctx.logger, 'warn', `[workflow] tool catalog failed (session=${sessionId}): ${String(error?.message ?? error)}`);
            }
        }
        const assembly = assemblePromptLayers([
            { name: 'header', text: header },
            { name: 'hard-rules', text: typeof hardRule === 'string' && hardRule.trim() !== '' ? `【本阶段硬规则】\n${hardRule.trim()}` : '' },
            { name: 'shared-detail', text: detail.shared_detail },
            { name: 'state-detail', text: detail.state_detail },
            { name: 'node-addition', text: additionParts.join('\n\n') },
            { name: 'verify-progress', text: verifyProgress },
            { name: 'tool-catalog', text: toolCatalog },
            { name: 'constraints', text: constraints.text.trim() === '' ? '' : `【约束 / 红线】（本项目绝不能做）\n${constraints.text.trim()}` },
            { name: 'manual-tags', text: tagsText },
            { name: 'manual-cue', text: cue },
            { name: 'session-manual', text: sessionManual },
        ], TOTAL_BUDGET_BYTES);
        const layers = new Map();
        const layerBytes = new Map();
        for (const layer of assembly.layers) {
            layers.set(layer.name, layer.text);
            layerBytes.set(layer.name, layer.bytes);
        }
        const signature = assembly.layers.map((layer) => `${layer.name}:${layer.text.length}`).join('|')
            + `|dropped:${assembly.dropped.map((item) => item.name).join(',')}`;
        const built = {
            layers,
            layerBytes,
            state: node.current_state,
            nodeId: node.node_id,
            bytes: assembly.keptBytes,
            dropped: assembly.dropped,
            signature,
        };
        cache.set(sessionId, built);
        return built;
    };
    /** 只在内容变化时打日志：每轮都刷 8 行会把事件环冲掉。 */
    const logLayers = (sessionId, next, previous) => {
        for (const spec of PROMPT_LAYER_SPECS) {
            const text = next.layers.get(spec.name) ?? '';
            if (text === '')
                continue;
            const bytes = next.layerBytes.get(spec.name) ?? 0;
            const before = previous?.layers.get(spec.name) ?? '';
            if (before === text)
                continue;
            logEvent(ctx.logger, 'info', `[workflow] layer ${spec.name} (session=${sessionId}, order=${spec.order}, bytes=${bytes})`);
        }
        for (const item of next.dropped) {
            const wasDropped = (previous?.dropped ?? []).some((old) => old.name === item.name);
            if (wasDropped)
                continue;
            logEvent(ctx.logger, 'warn', `[workflow] layer dropped (session=${sessionId}, name=${item.name}, bytes=${item.bytes}, reason=${item.reason})`);
        }
    };
    /** 算一次 + 打日志（刷新与 refreshNow 共用，保证两条路径的埋点一致）。 */
    const buildAndLog = async (sessionId) => {
        // 旧值必须在 buildText 之前取：buildText 自己会覆盖缓存。
        const previous = cache.get(sessionId);
        const startedAt = Date.now();
        const built = await buildText(sessionId);
        if (built === null)
            return null;
        logLayers(sessionId, built, previous);
        // 汇总行每轮都打一条：这轮的层数、总量、被丢了几层一眼可见。
        logEvent(ctx.logger, 'info', `[workflow] state-context ok (session=${sessionId}, bytes=${built.bytes}, budget=${TOTAL_BUDGET_BYTES}, headroom=${TOTAL_BUDGET_BYTES - built.bytes}, layers=${built.layers.size}, dropped=${built.dropped.length}, ${Date.now() - startedAt}ms)`);
        return built;
    };
    /** 异步刷新，同一个会话串行去重。 */
    const refresh = (sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '' || pending.has(sessionId))
            return;
        if (!isWorkflowSession(sessionId))
            return;
        pending.add(sessionId);
        void buildAndLog(sessionId)
            .catch((error) => {
            logEvent(ctx.logger, 'warn', `workflow state context refresh failed (session=${sessionId}): %o ${String(error)}`);
        })
            .finally(() => pending.delete(sessionId));
    };
    /** 同步读缓存；未命中时排一次刷新，本次先返回空（下一步起有内容）。 */
    const readLayer = (sessionId, name) => {
        if (typeof sessionId !== 'string' || sessionId === '')
            return '';
        if (!isWorkflowSession(sessionId))
            return '';
        const entry = cache.get(sessionId);
        if (entry !== undefined)
            return entry.layers.get(name) ?? '';
        // 冷缓存：记一条，用来区分"这一轮没注入"是首次装配还是缓存被清了。
        logEvent(ctx.logger, 'info', `[workflow] context cold (session=${sessionId})`);
        refresh(sessionId);
        return '';
    };
    /** 合并全部保留层（调试接口 /state-context 用）。 */
    const joinLayers = (entry) => PROMPT_LAYER_SPECS
        .map((spec) => entry.layers.get(spec.name) ?? '')
        .filter((text) => text !== '')
        .join('\n\n');
    // 每一步前刷新当前会话的缓存（异步钩子，可以读盘）。
    ctx.on('agent/pre-step', async (_payload, next) => {
        const payload = _payload ?? {};
        const sessionId = payload.agent?.session?.id;
        if (typeof sessionId === 'string')
            refresh(sessionId);
        return next();
    });
    // 主通道：给每个 agent 注册**作用域内**的动态上下文（同名会覆盖全局那份）。
    ctx.on('agent/created', function (payload) {
        const sessionId = payload?.agent?.session?.id;
        if (typeof sessionId !== 'string' || sessionId === '')
            return;
        // 不是工作流预设的会话：既不注入，也不注册上下文位。
        if (!isWorkflowSession(sessionId))
            return;
        // Agent 重建（会话恢复 / 页面刷新）时这条会再出现一次：排查"第二轮丢注入"就看它。
        logEvent(ctx.logger, 'info', `[workflow] context registered (session=${sessionId})`);
        refresh(sessionId);
        if (typeof this?.systemPrompt?.context !== 'function')
            return;
        for (const spec of PROMPT_LAYER_SPECS) {
            this.systemPrompt.context({
                name: `workflow:${spec.name}`,
                order: spec.order,
                text: () => readLayer(sessionId, spec.name),
            });
        }
    });
    // 兜底通道：全局注册一份，能从装配上下文里解析出会话就用（同名被作用域那份覆盖）。
    ctx.inject(['systemPrompt'], (scoped) => {
        scoped.effect(() => {
            const disposers = [];
            for (const spec of PROMPT_LAYER_SPECS) {
                disposers.push(scoped.systemPrompt.context({
                    name: `workflow:${spec.name}`,
                    order: spec.order,
                    text: (assemblyContext) => readLayer(pickSessionId(assemblyContext), spec.name),
                }));
            }
            return () => {
                for (const dispose of disposers) {
                    if (typeof dispose === 'function')
                        dispose();
                }
            };
        });
    });
    return {
        /** 强制算一次并返回合并文本（调试/预览用）。 */
        peek: async (sessionId) => {
            const built = await buildText(sessionId);
            return built === null ? '' : joinLayers(built);
        },
        /** 立刻重算并等它完成：状态推进后调用，保证下一轮模型请求看到的就是新状态。 */
        refreshNow: async (sessionId) => {
            const built = await buildAndLog(sessionId);
            return built === null ? '' : joinLayers(built);
        },
    };
}
/** 从装配上下文里尽量解析出会话 id（不同版本字段位置不同，逐个试）。 */
function pickSessionId(context) {
    const candidates = [
        context?.sessionId,
        context?.session?.id,
        context?.agent?.session?.id,
        context?.scope?.session?.id,
        context?.scope?.agent?.session?.id,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate !== '')
            return candidate;
    }
    return '';
}
//# sourceMappingURL=workflow-state-context.js.map