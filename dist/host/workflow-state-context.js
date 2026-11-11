// @ts-nocheck
/**
 * 把 workflow 节点的「操作细节」按当前状态注入会话上下文。
 *
 * 通道选择：`systemPrompt.context()`（系统提示里的动态上下文段），不是往会话里塞用户消息。
 * 理由：
 *   1) 每次装配重新求值 —— 状态一变文本自然跟着变，不需要"替换/作废旧消息"的记账；
 *   2) 不写进会话日志，不污染聊天记录，也没有消息 source 判别联合的兼容风险。
 *
 * 约束：context 的 text() 是同步求值，不能读盘，所以真实文本在 `agent/pre-step`
 * （异步）里算好放进缓存，text() 只读缓存。
 */
import { effectiveDetail } from '../engine/state-machine';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { DEFAULT_HARD_RULES } from '../schema/hard-rules';
import { logEvent } from './event-log';
import { join } from 'node:path';
/** 单块上下文上限（字节）：超了截断并标注，避免把系统提示撑爆。 */
const MAX_TEXT_BYTES = 8000;
/** 注入用的工作手册「最近内容」长度（全文不常驻，靠文件工具取更早部分）。 */
const MANUAL_RECENT_CHARS = 2000;
/**
 * 按**字节**截断，且不切坏多字节字符。
 *
 * 之前是「按字节判断、按字符切」：中文一个字 3 字节，字节超了 8000、字符没超 8000 时
 * 内容一个字都没切却照样追加「（已截断）」，等于骗模型；真到 8000 字符时又切出 24KB。
 */
export function truncateToBytes(text, maxBytes) {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.length <= maxBytes)
        return text;
    let end = maxBytes;
    // 回退到 UTF-8 字符边界：续字节形如 10xxxxxx。
    while (end > 0 && (buffer[end] & 0xc0) === 0x80)
        end -= 1;
    return `${buffer.subarray(0, end).toString('utf8')}…（已截断）`;
}
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回将要注入的文本。
 */
export function registerWorkflowStateContext(ctx, repository, 
/** 只有返回 true 的会话才注入；由宿主半按"这个会话是不是工作流预设"判定。 */
isWorkflowSession = () => true) {
    /** sessionId -> 算好的文本（同步可读，供 systemPrompt.context 使用）。 */
    const cache = new Map();
    const pending = new Set();
    const buildText = async (sessionId) => {
        const found = await repository.findBySession(sessionId);
        if (found === null || found === undefined) {
            cache.delete(sessionId);
            logEvent(ctx.logger, 'info', `[workflow] context cleared (session=${sessionId}, reason=no-node)`);
            return '';
        }
        const snapshot = await repository.get(found.workflowId);
        if (snapshot === null) {
            cache.delete(sessionId);
            logEvent(ctx.logger, 'info', `[workflow] context cleared (session=${sessionId}, reason=no-workflow)`);
            return '';
        }
        const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
        if (node === undefined) {
            cache.delete(sessionId);
            logEvent(ctx.logger, 'info', `[workflow] context cleared (session=${sessionId}, reason=no-node-in-snapshot)`);
            return '';
        }
        const global = await repository.getAppGlobalOperationDetail();
        const effective = effectiveDetail(node.current_state, node, global);
        const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
        const parts = [
            '<workflow-state>',
            `节点：${node.title || '(未命名)'}　workflow：${snapshot.title}`,
            `当前状态：${label}`,
            '（阶段边界：只有「讨论中」会拦写操作；「验收中」「已完结」不拦写文件。改代码仍按阶段规则走，工具会返回该阶段的完整规则。）',
        ];
        if (typeof effective.full_detail === 'string' && effective.full_detail.trim() !== '') {
            parts.push('', effective.full_detail.trim());
        }
        // 插件层硬规则：不随用户「操作细节」编辑，按当前状态追加（覆盖值优先，缺省用常量）。
        const hardOverride = (global && typeof global === 'object' ? global.hard_rules : undefined) ?? {};
        const hardRule = node.current_state === 'discussing'
            ? (hardOverride.discussing ?? DEFAULT_HARD_RULES.discussing)
            : node.current_state === 'implementing'
                ? (hardOverride.implementing ?? DEFAULT_HARD_RULES.implementing)
                : node.current_state === 'verifying'
                    ? (hardOverride.verifying ?? DEFAULT_HARD_RULES.verifying)
                    : '';
        if (typeof hardRule === 'string' && hardRule.trim() !== '') {
            parts.push('', `【本阶段硬规则】\n${hardRule.trim()}`);
        }
        // 节点级「全局附加」：不管当前什么状态都追加。
        const nodeAdditional = typeof node.additional_detail === 'object' && node.additional_detail !== null
            ? node.additional_detail.global
            : undefined;
        if (typeof nodeAdditional === 'string' && nodeAdditional.trim() !== '') {
            parts.push('', nodeAdditional.trim());
        }
        // 节点级附加说明：只作用于当前状态，接在最后。
        const addition = typeof node.additional_detail === 'object' && node.additional_detail !== null
            ? node.additional_detail[node.current_state]
            : undefined;
        if (typeof addition === 'string' && addition.trim() !== '') {
            parts.push('', `本节点补充要求：${addition.trim()}`);
        }
        // —— 会话手册（方案 + 实施顺序） + 项目手册（总览/决策/要点）——
        const manualData = await repository.readNodeManual(found.workflowId, found.nodeId);
        if (manualData !== null) {
            const manual = manualData.manual;
            const recent = manual.length > MANUAL_RECENT_CHARS
                ? `${manual.slice(-MANUAL_RECENT_CHARS)}\n…（更早内容见文件）`
                : manual;
            parts.push('', `本会话手册：${join(manualData.notesDir, `会话手册-${found.nodeId}.md`)}`);
            if (recent.trim() !== '')
                parts.push(recent);
        }
        // —— 项目手册按优先级注入：约束与坑永远在最前，总览/决策只给摘要 ——
        const projectSections = await repository.readGlobalManualSections(found.workflowId);
        const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
        const projectBlocks = [];
        if (projectSections.constraints.trim() !== '')
            projectBlocks.push(`【约束 / 红线】\n${clip(projectSections.constraints, 300)}`);
        if (projectSections.pitfalls.trim() !== '')
            projectBlocks.push(`【坑与防线】\n${clip(projectSections.pitfalls, 400)}`);
        if (projectSections.overview.trim() !== '')
            projectBlocks.push(`【项目总览】\n${clip(projectSections.overview, 120)}`);
        if (projectSections.decisions.trim() !== '')
            projectBlocks.push(`【决策记录】\n${clip(projectSections.decisions, 160)}`);
        if (projectBlocks.length > 0)
            parts.push('', '项目手册：', projectBlocks.join('\n\n'));
        // 常驻 + 状态推进后的落笔提示：推进会刷新本块，这里天然是"刚推进"那一刻。
        parts.push('', '收尾时回答四问并写进项目手册：① 本次新增或推翻了什么决策（写「决策记录」）；② 踩到或复现了什么坑（写「坑与防线」，按「现象 → 根因 → 防线 → 自查」）；③ 两样都没有就写「无」；④ 手册/文档描述与实现是否一致，不一致改了什么。同时同步本会话手册的「方案」与「实施顺序」。');
        parts.push('</workflow-state>');
        const text = truncateToBytes(parts.join('\n'), MAX_TEXT_BYTES);
        cache.set(sessionId, { text, nodeId: node.node_id, state: node.current_state });
        return text;
    };
    /** 异步刷新，同一个会话串行去重。 */
    const refresh = (sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '' || pending.has(sessionId))
            return;
        if (!isWorkflowSession(sessionId))
            return;
        pending.add(sessionId);
        void buildText(sessionId)
            .catch((error) => {
            logEvent(ctx.logger, 'warn', `workflow state context refresh failed (session=${sessionId}): %o ${String(error)}`);
        })
            .finally(() => pending.delete(sessionId));
    };
    /** 同步读缓存；未命中时排一次刷新，本次先返回空（下一步起有内容）。 */
    const readText = (sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '')
            return '';
        if (!isWorkflowSession(sessionId))
            return '';
        const entry = cache.get(sessionId);
        if (entry !== undefined)
            return entry.text;
        // 冷缓存：记一条，用来区分"这一轮没注入"是首次装配还是缓存被清了。
        logEvent(ctx.logger, 'info', `[workflow] context cold (session=${sessionId})`);
        refresh(sessionId);
        return '';
    };
    // 每一步前刷新当前会话的缓存（异步钩子，可以读盘）。
    ctx.on('agent/pre-step', async (_payload, next) => {
        const payload = _payload ?? {};
        const sessionId = payload.agent?.session?.id;
        if (typeof sessionId === 'string')
            refresh(sessionId);
        return next();
    });
    // 主通道：给每个 agent 注册一份**作用域内**的动态上下文（同名会覆盖全局那份）。
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
        this.systemPrompt.context({
            name: 'workflow:state',
            order: 150,
            text: () => readText(sessionId),
        });
    });
    // 兜底通道：全局注册一份，能从装配上下文里解析出会话就用（同名被作用域那份覆盖）。
    ctx.inject(['systemPrompt'], (scoped) => {
        scoped.effect(() => scoped.systemPrompt.context({
            name: 'workflow:state',
            order: 150,
            text: (assemblyContext) => readText(pickSessionId(assemblyContext)),
        }));
    });
    return {
        /** 强制算一次并返回（调试/预览用）。 */
        peek: async (sessionId) => buildText(sessionId),
        /** 立刻重算并等它完成：状态推进后调用，保证下一轮模型请求看到的就是新状态。 */
        refreshNow: async (sessionId) => {
            const startedAt = Date.now();
            const text = await buildText(sessionId);
            logEvent(ctx.logger, 'info', `[workflow] state-context ok (session=${sessionId}, bytes=${Buffer.byteLength(text, 'utf8')}, ${Date.now() - startedAt}ms)`);
            return text;
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