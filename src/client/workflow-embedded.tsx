// @ts-nocheck
/**
 * workflow 工作区模块（与 workspace-browser 解耦）。
 *
 * 只通过 `workspace-kind-registry` 的 `registerWorkspaceKindPlugin` 把自己挂进侧栏，
 * 不 import `workspace-browser`；共享的只有 `workspace-kind`（枚举）、`workspace-ui`（CSS/图标原语）、
 * `../schema/node-state-label`（状态中文名）。
 */
import { useEffect, useState } from 'react';
import { WorkspaceKind } from './workspace-kind';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { rowsClass, joinClasses, WorkspaceKindIcon } from './workspace-ui';
import {
  Menu,
  Tooltip,
  IconEllipsisOutlineRegular,
  IconTriangleRightFillRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { WorkspaceKindPlugin } from './workspace-kind-registry';

/** 五态单向推进表。 */
const NEXT_NODE_STATE: Record<string, string | null> = {
  not_started: 'discussing',
  discussing: 'implementing',
  implementing: 'verifying',
  verifying: 'completed',
  completed: null,
};

/** 状态点的颜色。 */
const NODE_STATE_COLOR: Record<string, string> = {
  not_started: 'var(--dsw-alias-state-idle-primary)',
  discussing: 'var(--dsw-alias-state-warn-primary)',
  implementing: 'var(--dsw-alias-brand-primary)',
  verifying: 'var(--dsw-alias-state-warn-primary)',
  completed: 'var(--dsw-alias-state-success-primary)',
};

async function listWorkflows() {
  const response = await fetch('/dsh-agent-workflow/list');
  const data = await response.json();
  return data?.ok === true && Array.isArray(data.items) ? data.items : [];
}

async function createWorkflow(path: string) {
  const response = await fetch('/dsh-agent-workflow/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await response.json().catch(() => null);
  if (data?.ok !== true) throw new Error(String(data?.error ?? '创建失败'));
}

/**
 * workflow 工作区的可嵌入渲染：与 usual 工作区同一套交互——
 * 工作区行有「⋯」和「新建子会话」；每个节点行也是「⋯ + 新建子会话」。
 */
function WorkflowWorkspaceItem(props: { summary: any; collapsed: boolean; onToggle: () => void; onChanged?: () => void }) {
  const { summary, collapsed, onToggle, onChanged } = props;
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);

  /** 置顶 / 取消置顶：写我们自己的 workflow 快照，然后让侧栏重拉列表重排。 */
  const togglePinned = async () => {
    try {
      const response = await fetch('/dsh-agent-workflow/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: summary.id, pinned: summary.pinned !== true }),
      });
      const data = await response.json();
      if (data?.ok === true) onChanged?.();
      else console.error('[dsh-agent-workflow] 置顶 workflow 失败：', data);
    } catch (error) {
      console.error('[dsh-agent-workflow] 置顶 workflow 失败：', error);
    }
  };


  const load = async () => {
    if (snapshot !== null) return;
    setLoading(true);
    try {
      const response = await fetch(`/dsh-agent-workflow/get?id=${encodeURIComponent(summary.id)}`);
      const data = await response.json();
      if (data?.ok === true) setSnapshot(data.snapshot);
    } catch (error) {
      console.error('[dsh-agent-workflow] 读取 workflow 失败：', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!collapsed) void load();
  }, [collapsed]);

  const addChildTo = async (parentId: string) => {
    try {
      const response = await fetch('/dsh-agent-workflow/add-node', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: summary.id, parentId, title: '新子会话' }),
      });
      const data = await response.json();
      if (data?.ok === true) setSnapshot(data.snapshot);
    } catch (error) {
      console.error('[dsh-agent-workflow] 新建子会话失败：', error);
    }
  };

  const transition = async (nodeId: string, to: string) => {
    try {
      const response = await fetch('/dsh-agent-workflow/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: summary.id, nodeId, to }),
      });
      const data = await response.json();
      if (data?.ok === true) setSnapshot(data.snapshot);
    } catch (error) {
      console.error('[dsh-agent-workflow] 推进状态失败：', error);
    }
  };

  const rootId = snapshot?.workspace_id ?? summary.id;
  const byId = new Map<string, any>((snapshot?.nodes ?? []).map((node: any) => [node.node_id, node]));

  const renderNodeRow = (node: any, depth: number): any => {
    const nextState = NEXT_NODE_STATE[node.current_state] ?? null;
    // 「推进」已拆成独立的 → 按钮，菜单里只留「新建子会话」。
    const menuItems = [{ id: 'child', label: '新建子会话' }];
    const children = (node.child_ids ?? [])
      .map((id: string) => byId.get(id))
      .filter((child: any) => child !== undefined);

    return (
      <div key={node.node_id}>
        <div
          role="treeitem"
          className={rowsClass('sessionRow')}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <span className={rowsClass('slot')}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' }} />
          </span>
          <span className={rowsClass('title')}>{node.title ?? node.node_type}</span>
          <span className={rowsClass('time')}>{NODE_STATE_LABEL[node.current_state as keyof typeof NODE_STATE_LABEL] ?? node.current_state}</span>
          <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
            <Menu
              open={openNodeId === node.node_id}
              onClose={() => setOpenNodeId(null)}
              items={menuItems}
              onSelect={(id: string) => {
                setOpenNodeId(null);
                if (id === 'child') void addChildTo(node.node_id);
              }}
              portal
              closeOnPointerLeave
              anchor={(
                <button
                  type="button"
                  className={rowsClass('iconButton')}
                  aria-label="会话菜单"
                  onClick={() => setOpenNodeId((previous) => (previous === node.node_id ? null : node.node_id))}
                >
                  <IconEllipsisOutlineRegular />
                </button>
              )}
            />
            {/* 推进到下一阶段：向右方向键（位于「…」和「+」中间）；已完结时禁用。 */}
            <Tooltip label={nextState === null ? '已完结' : `推进到 ${NODE_STATE_LABEL[nextState as keyof typeof NODE_STATE_LABEL] ?? nextState}`} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className={rowsClass('iconButton')}
                aria-label="推进到下一阶段"
                disabled={nextState === null}
                onClick={() => {
                  if (nextState !== null) void transition(node.node_id, nextState);
                }}
                style={{ opacity: nextState === null ? 0.35 : 1 }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
                  <path d="M5 12h13" />
                  <path d="m12.5 6 6 6-6 6" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip label="新建子会话" side="bottom" align="end" delayMs={500} portal>
              <button type="button" className={rowsClass('iconButton')} aria-label="新建子会话" onClick={() => void addChildTo(node.node_id)}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden style={{ display: 'block' }}>
                  <path d="M12 6v12M6 12h12" />
                </svg>
              </button>
            </Tooltip>
          </span>
        </div>
        {children.map((child: any) => renderNodeRow(child, depth + 1))}
      </div>
    );
  };

  const rootNode = byId.get(rootId);

  return (
    <div className={rowsClass('groupSection')} style={{ display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }}>
      <div role="treeitem" data-row-key={`workflow:${summary.id}`} aria-expanded={!collapsed} className={rowsClass('sessionRow')}>
        <span className={joinClasses(rowsClass('slot'), rowsClass('folder'))} style={{ color: '#4d7bfd' }} onClick={onToggle}>
          <WorkspaceKindIcon kind={WorkspaceKind.Workflow} />
        </span>
        <span className={joinClasses(rowsClass('slot'), rowsClass('chevron'))} onClick={onToggle}>
          <IconTriangleRightFillRegular className={joinClasses(rowsClass('arrow'), !collapsed && rowsClass('arrowOpen'))} />
        </span>
        <span className={rowsClass('projectText')} onClick={onToggle}>
          <span className={rowsClass('title')}>{summary.title}</span>
        </span>
        <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
          <Menu
            open={workspaceMenuOpen}
            onClose={() => setWorkspaceMenuOpen(false)}
            items={[
              { id: 'pin', label: summary.pinned === true ? '取消置顶' : '置顶' },
              { id: 'child', label: '新建子会话' },
              { id: 'reload', label: '刷新' },
            ]}
            onSelect={(id: string) => {
              setWorkspaceMenuOpen(false);
              if (id === 'pin') void togglePinned();
              else if (id === 'child') void addChildTo(rootId);
              else if (id === 'reload') void load();
            }}
            portal
            closeOnPointerLeave
            anchor={(
              <button type="button" className={rowsClass('iconButton')} aria-label="工作区菜单" onClick={() => setWorkspaceMenuOpen((value) => !value)}>
                <IconEllipsisOutlineRegular />
              </button>
            )}
          />
          <Tooltip label="新建子会话" side="bottom" align="end" delayMs={500} portal>
            <button type="button" className={rowsClass('iconButton')} aria-label="新建子会话" onClick={() => void addChildTo(rootId)}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden style={{ display: 'block' }}>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8.5v7M8.5 12h7" />
              </svg>
            </button>
          </Tooltip>
        </span>
      </div>

      {!collapsed ? (
        <div style={{ paddingBottom: 4 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }}>加载中…</div>
          ) : rootNode ? (
            renderNodeRow(rootNode, 0)
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const workflowKindPlugin: WorkspaceKindPlugin = {
  kind: WorkspaceKind.Workflow,
  list: listWorkflows,
  create: createWorkflow,
  renderItem: (summary, collapsed, onToggle, onChanged) => (
    <WorkflowWorkspaceItem summary={summary} collapsed={collapsed} onToggle={onToggle} onChanged={onChanged} />
  ),
};
