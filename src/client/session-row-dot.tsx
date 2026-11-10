// @ts-nocheck
/**
 * 侧栏会话行「行尾常驻状态点」：非悬停时始终显示一个按 workflow 状态着色的小圆点。
 *
 * - 挂在 sidebar.session.row.trailing（常驻图标位，非交互；悬停该行时宿主自动隐藏）。
 * - 数据走批量接口 /sidebar-nodes?path=…，一次拿整个工作区的节点状态，模块内 promise 缓存去重，
 *   5 秒 TTL；状态机推进后由 badge 派发 window 事件 `dsh-workflow-state-changed` 触发刷新。
 */
import { useEffect, useState } from 'react';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { NODE_STATE_COLOR } from './node-state-color';

const CACHE_TTL_MS = 5000;
const promiseCache = new Map<string, Promise<Record<string, string>>>();

function getWorkspaceStates(path: string): Promise<Record<string, string>> {
  const cached = promiseCache.get(path);
  if (cached !== undefined) return cached;
  const promise = (async () => {
    try {
      const response = await fetch(`/dsh-agent-workflow/sidebar-nodes?path=${encodeURIComponent(path)}`);
      const responseBody = await response.json().catch(() => null);
      if (responseBody?.ok === true && typeof responseBody.nodes === 'object' && responseBody.nodes !== null) {
        return responseBody.nodes as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  })();
  promiseCache.set(path, promise);
  window.setTimeout(() => {
    if (promiseCache.get(path) === promise) promiseCache.delete(path);
  }, CACHE_TTL_MS);
  return promise;
}

function SessionStateDot(props: { sessionId?: string; useSessions?: any }) {
  const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
  const cwd = typeof props?.useSessions === 'function'
    ? props.useSessions((s: any) => (s?.byId?.[sessionId]?.cwd ?? ''))
    : '';
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId === '' || cwd === '') {
      setState(null);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      void getWorkspaceStates(cwd).then((map) => {
        if (!cancelled) setState(map[sessionId] ?? null);
      });
    };
    load();
    const onChanged = () => {
      promiseCache.clear();
      load();
    };
    window.addEventListener('dsh-workflow-state-changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('dsh-workflow-state-changed', onChanged);
    };
  }, [sessionId, cwd]);

  if (state === null) return null;
  const color = NODE_STATE_COLOR[state];
  if (color === undefined) return null;
  return (
    <span
      aria-hidden
      title={NODE_STATE_LABEL[state as keyof typeof NODE_STATE_LABEL] ?? state}
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
      }}
    />
  );
}

/** 把状态点注册到侧栏会话行的行尾常驻图标位。 */
export function applySessionRowStateDots(ctx: any) {
  ctx.slots.inject('sidebar.session.row.trailing', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.trailing',
        id: 'dsh-agent-workflow.state-dot',
        order: 10,
        label: 'workflow 状态点',
      },
      SessionStateDot,
    ),
  );
}
