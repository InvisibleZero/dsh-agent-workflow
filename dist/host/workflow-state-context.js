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
import { logEvent } from './event-log';
import { join } from 'node:path';
/** 单块上下文上限（字节）：超了截断并标注，避免把系统提示撑爆。 */
const MAX_TEXT_BYTES = 8000;
/** 注入用的工作手册「最近内容」长度（全文不常驻，靠文件工具取更早部分）。 */
const MANUAL_RECENT_CHARS = 2000;
/** 注入用的父级摘要上限。 */
const GLOBAL_MANUAL_CHARS = 800;
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回将要注入的文本。
 */
export function registerWorkflowStateContext(ctx, repository) {
    /** sessionId -> 算好的文本（同步可读，供 systemPrompt.context 使用）。 */
    const cache = new Map();
    const pending = new Set();
    const buildText = async (sessionId) => {
        const found = await repository.findBySession(sessionId);
        if (found === null || found === undefined) {
            cache.delete(sessionId);
            return '';
        }
        const snapshot = await repository.get(found.workflowId);
        if (snapshot === null) {
            cache.delete(sessionId);
            return '';
        }
        const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
        if (node === undefined) {
            cache.delete(sessionId);
            return '';
        }
        const global = await repository.getAppGlobalOperationDetail();
        const effective = effectiveDetail(node.current_state, node, global);
        const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
        const parts = [
            '<workflow-state>',
            `节点：${node.title || '(未命名)'}　workflow：${snapshot.title}`,
            `当前状态：${label}`,
        ];
        if (typeof effective.full_detail === 'string' && effective.full_detail.trim() !== '') {
            parts.push('', effective.full_detail.trim());
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
        const globalManual = await repository.readGlobalManual(found.workflowId);
        const globalTrimmed = globalManual.trim();
        if (globalTrimmed !== '') {
            parts.push('', '项目手册（总览 / 决策 / 要点）：', globalTrimmed.slice(0, GLOBAL_MANUAL_CHARS));
        }
        // 常驻 + 状态推进后的落笔提示：推进会刷新本块，这里天然是"刚推进"那一刻。
        parts.push('', '收尾时把本次结论写进项目手册的「要点 / 决策」，并同步更新本会话手册的「方案」与「实施顺序」。');
        parts.push('</workflow-state>');
        let text = parts.join('\n');
        if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
            text = `${text.slice(0, MAX_TEXT_BYTES)}…（已截断）`;
        }
        cache.set(sessionId, { text, nodeId: node.node_id, state: node.current_state });
        return text;
    };
    /** 异步刷新，同一个会话串行去重。 */
    const refresh = (sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '' || pending.has(sessionId))
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
        const entry = cache.get(sessionId);
        if (entry !== undefined)
            return entry.text;
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