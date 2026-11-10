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

/** 单块上下文上限（字节）：超了截断并标注，避免把系统提示撑爆。 */
const MAX_TEXT_BYTES = 3200;

/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回将要注入的文本。
 */
export function registerWorkflowStateContext(ctx: any, repository: any): { peek: (sessionId: string) => Promise<string> } {
  /** sessionId -> 算好的文本（同步可读，供 systemPrompt.context 使用）。 */
  const cache = new Map<string, { text: string; nodeId: string; state: string }>();
  const pending = new Set<string>();

  const buildText = async (sessionId: string): Promise<string> => {
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
    const node = snapshot.nodes.find((candidate: any) => candidate.node_id === found.nodeId);
    if (node === undefined) {
      cache.delete(sessionId);
      return '';
    }
    const global = await repository.getAppGlobalOperationDetail();
    const effective = effectiveDetail(node.current_state, node, global);
    const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
    const parts: string[] = [
      '<workflow-state>',
      `节点：${node.title || '(未命名)'}　workflow：${snapshot.title}`,
      `当前状态：${label}`,
    ];
    if (typeof effective.full_detail === 'string' && effective.full_detail.trim() !== '') {
      parts.push('', effective.full_detail.trim());
    }
    if (typeof effective.enter_trigger === 'string' && effective.enter_trigger.trim() !== '') {
      parts.push('', `进入本状态时的默认输入：${effective.enter_trigger.trim()}`);
    }
    parts.push('</workflow-state>');
    let text = parts.join('\n');
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
      text = `${text.slice(0, MAX_TEXT_BYTES)}…（已截断）`;
    }
    cache.set(sessionId, { text, nodeId: node.node_id, state: node.current_state });
    return text;
  };

  /** 异步刷新，同一个会话串行去重。 */
  const refresh = (sessionId: string): void => {
    if (typeof sessionId !== 'string' || sessionId === '' || pending.has(sessionId)) return;
    pending.add(sessionId);
    void buildText(sessionId)
      .catch((error: unknown) => {
        ctx.logger?.warn?.('workflow state context refresh failed: %o', error);
      })
      .finally(() => pending.delete(sessionId));
  };

  /** 同步读缓存；未命中时排一次刷新，本次先返回空（下一步起有内容）。 */
  const readText = (sessionId: string): string => {
    if (typeof sessionId !== 'string' || sessionId === '') return '';
    const entry = cache.get(sessionId);
    if (entry !== undefined) return entry.text;
    refresh(sessionId);
    return '';
  };

  // 每一步前刷新当前会话的缓存（异步钩子，可以读盘）。
  ctx.on('agent/pre-step', async (_payload: any, next: any) => {
    const payload = _payload ?? {};
    const sessionId = payload.agent?.session?.id;
    if (typeof sessionId === 'string') refresh(sessionId);
    return next();
  });

  // 主通道：给每个 agent 注册一份**作用域内**的动态上下文（同名会覆盖全局那份）。
  ctx.on('agent/created', function (this: any, payload: any) {
    const sessionId = payload?.agent?.session?.id;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    refresh(sessionId);
    if (typeof this?.systemPrompt?.context !== 'function') return;
    this.systemPrompt.context({
      name: 'workflow:state',
      order: 150,
      text: () => readText(sessionId),
    });
  });

  // 兜底通道：全局注册一份，能从装配上下文里解析出会话就用（同名被作用域那份覆盖）。
  ctx.inject(['systemPrompt'], (scoped: any) => {
    scoped.effect(() => scoped.systemPrompt.context({
      name: 'workflow:state',
      order: 150,
      text: (assemblyContext: any) => readText(pickSessionId(assemblyContext)),
    }));
  });

  return {
    peek: async (sessionId: string) => buildText(sessionId),
  };
}

/** 从装配上下文里尽量解析出会话 id（不同版本字段位置不同，逐个试）。 */
function pickSessionId(context: any): string {
  const candidates = [
    context?.sessionId,
    context?.session?.id,
    context?.agent?.session?.id,
    context?.scope?.session?.id,
    context?.scope?.agent?.session?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }
  return '';
}
