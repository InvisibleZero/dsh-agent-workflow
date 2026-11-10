// @ts-nocheck
/**
 * workflow 模块（减法后）：不再渲染树 / 不再替换宿主的侧栏浏览器。
 *
 * 现在只保留会话维度的东西：
 *   - 会话状态徽标（输入框工具条）：当前状态 + 推进 + 实施清单；
 *   - 节点补充说明 / 工作手册（只读）、全局操作细节设置：都由徽标自己用 portal 弹。
 *
 * 弹窗改用 `createPortal(document.body)`：输入框容器带 transform，自绘 fixed 会跑偏，
 * portal 到 body 后 fixed 相对视口，彻底绕开这个坑。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { WorkflowNodeDetailDialog, WorkflowSettingsDialog, WorkflowConfirmDialog } from './workflow-dialogs';
import { menuPointFromEvent, menuAnchorRect } from './menu-util';
import { NODE_STATE_COLOR } from './node-state-color';
import { Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';

/** 五态单向推进表。 */
const NEXT_NODE_STATE: Record<string, string | null> = {
  not_started: 'discussing',
  discussing: 'implementing',
  implementing: 'verifying',
  verifying: 'completed',
  completed: null,
};

interface NodeInfo {
  state: string;
  workflowId: string;
  nodeId: string;
  enterTrigger: string;
}

interface ChecklistItem {
  label: string;
  done: boolean;
}

/** 返工（后退）转移表：当前态 → 可退回的态。 */
const BACKWARD_STATES: Record<string, string[]> = {
  implementing: ['discussing'],
  verifying: ['implementing', 'discussing'],
};

function WorkflowStateBadge(props: { sessionId?: string; inputActions?: any; useSessions?: any }) {
  const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [hasPlan, setHasPlan] = useState(true);
  const [checklistMenu, setChecklistMenu] = useState<{ x: number; y: number } | null>(null);
  const [backwardMenu, setBackwardMenu] = useState<{ x: number; y: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [returnToDetail, setReturnToDetail] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const claimedRef = useRef(false);

  // 自动认领需要会话的工作目录：useSessions 是带选择器的钩子，直接取当前会话的 cwd。
  const sessionCwd = typeof props?.useSessions === 'function'
    ? props.useSessions((s: any) => (s?.byId?.[sessionId]?.cwd ?? ''))
    : '';

  const ensureNode = async (workingDirectory: string): Promise<boolean> => {
    try {
      const response = await fetch('/dsh-agent-workflow/ensure-node', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, workingDirectory }),
      });
      const data = await response.json().catch(() => null);
      return data?.ok === true && data.node !== null && data.node !== undefined;
    } catch {
      return false;
    }
  };

  const readChecklist = async (workflowId: string, nodeId: string): Promise<{ checklist: ChecklistItem[]; hasPlan: boolean }> => {
    try {
      const response = await fetch(`/dsh-agent-workflow/node-checklist?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
      const data = await response.json().catch(() => null);
      if (data?.ok === true) {
        const items = Array.isArray(data.checklist) ? data.checklist : [];
        const plan = data.hasPlan !== false;
        setChecklist(items);
        setHasPlan(plan);
        return { checklist: items, hasPlan: plan };
      }
    } catch {
      setChecklist([]);
    }
    return { checklist: [], hasPlan: true };
  };

  const readNode = async (): Promise<NodeInfo | null> => {
    try {
      const response = await fetch(`/dsh-agent-workflow/node-by-session?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await response.json().catch(() => null);
      const node = data?.ok === true ? data.node : null;
      if (node === null || node === undefined) {
        setNodeInfo(null);
        return null;
      }
      const info: NodeInfo = {
        state: String(node.current_state),
        workflowId: String(node.workflowId),
        nodeId: String(node.nodeId),
        enterTrigger: typeof node.enter_trigger === 'string' ? node.enter_trigger : '',
      };
      setNodeInfo(info);
      return info;
    } catch {
      setNodeInfo(null);
      return null;
    }
  };

  /** 把「进入后默认输入」填进输入框（半自动：不发送）。InputActions 方法名按候选逐个试。 */
  const pushDraft = (text: string): boolean => {
    const actions = props?.inputActions;
    if (actions === undefined || actions === null || text === '') return false;
    const candidates = ['setText', 'setDraft', 'replaceText', 'insertText', 'appendText', 'setValue', 'insert', 'append'];
    for (const name of candidates) {
      const method = actions[name];
      if (typeof method !== 'function') continue;
      try {
        method.call(actions, text);
        return true;
      } catch (error) {
        console.warn('[dsh-agent-workflow] 写入默认输入失败：', name, error);
      }
    }
    console.warn('[dsh-agent-workflow] 输入框没有可用的写入方法，现有方法：', Object.keys(actions).join(','));
    return false;
  };

  useEffect(() => {
    if (sessionId === '') {
      setNodeInfo(null);
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      let info = await readNode();
      // 自动认领：会话还没节点时，用它的工作目录补建一个（只试一次）。
      if (info === null && !claimedRef.current && sessionCwd !== '') {
        claimedRef.current = true;
        const ok = await ensureNode(sessionCwd);
        if (ok) info = await readNode();
      }
      if (info !== null && info.state === 'implementing') void readChecklist(info.workflowId, info.nodeId);
      else setChecklist([]);
    };
    void tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, sessionCwd]);

  if (nodeInfo === null) return null;
  const label = NODE_STATE_LABEL[nodeInfo.state as keyof typeof NODE_STATE_LABEL] ?? nodeInfo.state;
  const nextState = NEXT_NODE_STATE[nodeInfo.state] ?? null;

  /** 真正写状态（前进或返工） + 刷新 + 填默认输入。 */
  const transitionTo = async (to: string) => {
    if (advancing) return;
    setAdvancing(true);
    const startedAt = Date.now();
    try {
      await fetch('/dsh-agent-workflow/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: nodeInfo.workflowId, nodeId: nodeInfo.nodeId, to }),
      });
      // 通知侧栏会话行的状态点刷新（清缓存并重取）。
      window.dispatchEvent(new Event('dsh-workflow-state-changed'));
      const info = await readNode();
      if (info !== null && info.enterTrigger !== '') pushDraft(info.enterTrigger);
      if (info !== null && info.state === 'implementing') void readChecklist(info.workflowId, info.nodeId);
      else setChecklist([]);
      console.info(`[dsh-agent-workflow] 推进成功 (to=${to}, ${Date.now() - startedAt}ms)`);
    } catch (error) {
      console.error('[dsh-agent-workflow] 推进状态失败：', error);
    } finally {
      setAdvancing(false);
    }
  };

  /** 推进：进入实现中前若方案没写，先弹确认。 */
  const advance = async () => {
    if (nextState === null || advancing) return;
    if (nextState === 'implementing') {
      const meta = await readChecklist(nodeInfo.workflowId, nodeInfo.nodeId);
      if (!meta.hasPlan) {
        setConfirmOpen(true);
        return;
      }
    }
    void transitionTo(nextState);
  };

  const doneCount = checklist.filter((item) => item.done).length;
  const backwardStates = BACKWARD_STATES[nodeInfo.state] ?? [];

  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          title="查看本节点的操作细节 / 工作手册"
          onClick={() => setDetailOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px',
            borderRadius: 6, border: '1px solid transparent', background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '22px',
            whiteSpace: 'nowrap', cursor: 'pointer',
          }}
          onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'transparent'; }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[nodeInfo.state] ?? 'transparent' }} />
          {label}
        </button>
        {nodeInfo.state === 'implementing' && checklist.length > 0 ? (
          <>
            <button
              type="button"
              title="实施进度（AI 自动勾选，只读）"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                const point = menuPointFromEvent(event);
                setChecklistMenu((current) => (current === null ? point : null));
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
                borderRadius: 6, border: '1px solid transparent', background: 'var(--dsw-alias-bg-layer-1)',
                color: doneCount === checklist.length ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-brand-primary)',
                fontSize: 11, lineHeight: '22px', whiteSpace: 'nowrap', cursor: 'pointer',
              }}
              onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }}
              onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'transparent'; }}
            >
              实施 {doneCount}/{checklist.length}
            </button>
            {checklistMenu !== null ? (
              <Menu
                open
                anchor={null}
                portal
                align="end"
                getAnchorRect={() => menuAnchorRect(checklistMenu)}
                items={checklist.map((item) => ({ id: item.label, label: `${item.done ? '✓' : '○'}  ${item.label}` }))}
                onClose={() => setChecklistMenu(null)}
                onSelect={() => setChecklistMenu(null)}
              />
            ) : null}
          </>
        ) : null}
        {backwardStates.length > 0 ? (
          <>
            <Tooltip label="返工（退回上一阶段）" side="top" delayMs={400} portal>
              <button
                type="button"
                aria-label="返工"
                disabled={advancing}
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  const point = menuPointFromEvent(event);
                  setBackwardMenu((current) => (current === null ? point : null));
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
                  border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'transparent',
                  color: 'var(--dsw-alias-label-secondary)', cursor: advancing ? 'progress' : 'pointer',
                  opacity: advancing ? 0.6 : 1,
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
                  <path d="M19 12H6" />
                  <path d="m11.5 6-6 6 6 6" />
                </svg>
              </button>
            </Tooltip>
            {backwardMenu !== null ? (
              <Menu
                open
                anchor={null}
                portal
                align="end"
                getAnchorRect={() => menuAnchorRect(backwardMenu)}
                items={backwardStates.map((state) => ({
                  id: state,
                  label: `返工到 ${NODE_STATE_LABEL[state as keyof typeof NODE_STATE_LABEL] ?? state}`,
                }))}
                onClose={() => setBackwardMenu(null)}
                onSelect={(id: string) => {
                  setBackwardMenu(null);
                  void transitionTo(id);
                }}
              />
            ) : null}
          </>
        ) : null}
        {nextState === null ? null : (
          <Tooltip label={`推进到 ${NODE_STATE_LABEL[nextState as keyof typeof NODE_STATE_LABEL] ?? nextState}`} side="top" delayMs={400} portal>
            <button
              type="button"
              aria-label="推进到下一阶段"
              disabled={advancing}
              onClick={() => void advance()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
                border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'transparent',
                color: 'var(--dsw-alias-label-secondary)', cursor: advancing ? 'progress' : 'pointer',
                opacity: advancing ? 0.6 : 1,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
                <path d="M5 12h13" />
                <path d="m12.5 6 6 6-6 6" />
              </svg>
            </button>
          </Tooltip>
        )}
      </span>
      {createPortal(
        <>
          {detailOpen ? (
            <WorkflowNodeDetailDialog
              workflowId={nodeInfo.workflowId}
              nodeId={nodeInfo.nodeId}
              onClose={() => setDetailOpen(false)}
              onOpenSettings={() => {
                setReturnToDetail(true);
                setDetailOpen(false);
                setSettingsOpen(true);
              }}
            />
          ) : null}
          {settingsOpen ? (
            <WorkflowSettingsDialog onClose={() => {
              setSettingsOpen(false);
              if (returnToDetail) {
                setReturnToDetail(false);
                setDetailOpen(true);
              }
            }} />
          ) : null}
          {confirmOpen ? (
            <WorkflowConfirmDialog
              title="进入实现中"
              message={'这个节点的工作手册里还没写「方案」小节，直接进入实现中可能没有执行依据。\n\n· 点「仍进入」直接推进\n· 点「取消」回讨论中继续完善方案'}
              confirmLabel="仍进入"
              onClose={() => setConfirmOpen(false)}
              onConfirm={() => {
                setConfirmOpen(false);
                void transitionTo(nextState);
              }}
            />
          ) : null}
        </>,
        document.body,
      )}
    </>
  );
}

/** 把状态徽标挂到输入框工具条的左侧控件区（权限控件的右边）。 */
export function applyWorkflowComposerBadge(ctx: any) {
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'dsh-agent-workflow.state',
        order: 10,
        label: 'workflow 状态',
      },
      WorkflowStateBadge,
    ),
  );
}
