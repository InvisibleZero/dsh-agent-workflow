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
import { WorkflowSettingsDialog, WorkflowNodeDetailDialog } from './workflow-dialogs';
import { rowsClass, joinClasses, WorkspaceKindIcon, menuPointFromEvent, menuAnchorRect } from './workspace-ui';
import {
  Menu,
  Tooltip,
  IconEllipsisOutlineRegular,
  IconTriangleRightFillRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconCopyOutlineRegular,
  IconArchiveOutlineRegular,
  IconUnarchiveOutlineRegular,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { normalizeWorkspacePath } from './workspace-kind-registry';
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

async function createWorkflow(path: string, context?: { workspaceId?: string | null }) {
  const hostWorkspaceId = typeof context?.workspaceId === 'string' ? context.workspaceId : undefined;
  const response = await fetch('/dsh-agent-workflow/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(hostWorkspaceId === undefined ? { path } : { path, hostWorkspaceId }),
  });
  const data = await response.json().catch(() => null);
  if (data?.ok !== true) throw new Error(String(data?.error ?? '创建失败'));
}

/** 从客户端 ctx 取服务：优先 ctx.get（取不到时回退属性访问）。 */
function readClientService(ctx: any, serviceName: string): any {
  if (ctx === undefined || ctx === null) return undefined;
  if (typeof ctx.get === 'function') {
    try {
      const viaGet = ctx.get(serviceName);
      if (viaGet !== undefined && viaGet !== null) return viaGet;
    } catch {
      // 继续走属性访问
    }
  }
  try {
    return ctx[serviceName];
  } catch {
    return undefined;
  }
}

/**
 * workflow 工作区的可嵌入渲染：与 usual 工作区同一套交互——
 * 工作区行有「⋯」和「新建子会话」；节点行点击打开该节点绑定的会话。
 */
function WorkflowWorkspaceItem(props: {
  summary: any;
  collapsed: boolean;
  onToggle: () => void;
  onChanged?: () => void;
  runtime: any;
}) {
  const { summary, collapsed, onToggle, onChanged, runtime } = props;
  const ctx = runtime?.ctx;
  const currentSessionId: string | null = runtime?.currentSessionId ?? null;
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceMenuPoint, setWorkspaceMenuPoint] = useState<{ x: number; y: number } | null>(null);
  /** 正在打开的节点菜单：节点 id + 触发按钮的屏幕坐标。 */
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  /** 全局操作细节弹窗（A/B/C/D）。 */
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  /** 节点操作细节弹窗（展示该节点当前生效的 B/C/D）。 */
  const [nodeDetailNodeId, setNodeDetailNodeId] = useState<string | null>(null);
  /** 正在「新建会话 + 绑定」的节点，避免连点重复建会话。 */
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);

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

  /**
   * 找到（必要时补建）该目录对应的宿主「目录工作区」。
   * 会话必须挂在真实工作区上，否则打开后只会停在「选择工作区」。
   */
  const resolveWorkspaceId = async (workingDirectory: string): Promise<string | null> => {
    // workflow 自己就是某个宿主目录工作区，快照里记着就直接用。
    const recorded = snapshot?.host_workspace_id;
    if (typeof recorded === 'string' && recorded !== '') return recorded;
    const existing = typeof runtime?.findWorkspaceIdByPath === 'function'
      ? runtime.findWorkspaceIdByPath(workingDirectory)
      : null;
    if (existing !== null && existing !== undefined && existing !== '') return existing;
    const workspacesService = readClientService(ctx, 'workspaces');
    if (workspacesService === undefined || typeof workspacesService.create !== 'function') return null;
    try {
      const created = await workspacesService.create({ path: workingDirectory });
      const createdId = typeof created?.workspaceId === 'string'
        ? created.workspaceId
        : (typeof created?.id === 'string' ? created.id : null);
      return createdId;
    } catch (error) {
      console.error('[dsh-agent-workflow] 补建目录工作区失败：', error);
      return null;
    }
  };

  /**
   * 点击节点行：打开该节点对应的会话。
   * 已绑定 → 直接 openSession；未绑定 → 在 workflow 的工作目录所属的工作区里新建会话，
   * 写回节点后打开（写回失败也照样打开，不阻塞用户看会话）。
   */
  const openNodeSession = async (node: any) => {
    if (busyNodeId !== null) return;
    const uiWorkspace = readClientService(ctx, 'uiWorkspace');
    if (uiWorkspace === undefined || typeof uiWorkspace.openSession !== 'function') {
      console.error('[dsh-agent-workflow] uiWorkspace 服务不可用，无法打开会话');
      return;
    }

    const boundSessionId = typeof node.session_id === 'string' && node.session_id !== '' ? node.session_id : null;
    if (boundSessionId !== null) {
      // 绑定的会话可能已经被归档/删除：还在就直接打开，不在就解绑后重建，避免点了没反应。
      const sessionsService = readClientService(ctx, 'sessions');
      const sessionById = sessionsService?.list?.getSnapshot?.()?.byId;
      const stillExists = sessionById !== undefined && sessionById !== null && sessionById[boundSessionId] !== undefined;
      if (stillExists) {
        uiWorkspace.openSession(boundSessionId);
        return;
      }
      console.warn('[dsh-agent-workflow] 节点绑定的会话已不存在，重新创建：', boundSessionId);
      try {
        await fetch('/dsh-agent-workflow/bind-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: summary.id, nodeId: node.node_id, sessionId: '' }),
        });
      } catch (error) {
        console.error('[dsh-agent-workflow] 清理失效绑定失败：', error);
      }
    }

    const sessions = readClientService(ctx, 'sessions');
    if (sessions === undefined || typeof sessions.create !== 'function') {
      console.error('[dsh-agent-workflow] sessions 服务不可用，无法新建会话');
      return;
    }

    setBusyNodeId(node.node_id);
    try {
      const workingDirectory = typeof snapshot?.working_directory === 'string' ? snapshot.working_directory : '';
      const workspaceId = workingDirectory !== '' ? await resolveWorkspaceId(workingDirectory) : null;
      const createdSessionId = await sessions.create(
        workspaceId !== null && workspaceId !== ''
          ? { workspaceId }
          : (workingDirectory !== '' ? { cwd: workingDirectory } : {}),
      );
      if (typeof createdSessionId !== 'string' || createdSessionId === '') throw new Error('新建会话没有返回 id');
      try {
        const response = await fetch('/dsh-agent-workflow/bind-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: summary.id, nodeId: node.node_id, sessionId: createdSessionId }),
        });
        const data = await response.json().catch(() => null);
        if (data?.ok === true) setSnapshot(data.snapshot);
        else console.error('[dsh-agent-workflow] 绑定会话失败：', data);
      } catch (bindError) {
        console.error('[dsh-agent-workflow] 绑定会话失败：', bindError);
      }
      uiWorkspace.openSession(createdSessionId);
    } catch (error) {
      console.error('[dsh-agent-workflow] 打开节点会话失败：', error);
    } finally {
      setBusyNodeId(null);
    }
  };

  const rootId = snapshot?.workspace_id ?? summary.id;  const byId = new Map<string, any>((snapshot?.nodes ?? []).map((node: any) => [node.node_id, node]));

  /**
   * 节点绑定的会话在宿主里的实时状态。
   * 复用宿主菜单做置顶/归档/改名时，行必须反映结果，否则用户以为菜单没生效。
   */
  const sessionsById: Record<string, any> = readClientService(ctx, 'sessions')?.list?.getSnapshot?.()?.byId ?? {};
  const workspaceSnapshot: any = readClientService(ctx, 'workspaces')?.list?.getSnapshot?.() ?? null;
  const pinnedSessionIds: Set<string> = new Set(workspaceSnapshot?.pinnedSessionIds ?? []);
  const archivedSessionIds: Set<string> = new Set(workspaceSnapshot?.archivedSessionIds ?? []);

  /**
   * 节点置顶的语义由我们定义：**同级之内排到最前**（宿主只负责把会话标记成 pinned）。
   * 排序稳定：未置顶的节点保持 child_ids 原顺序。
   */
  const isNodePinned = (node: any): boolean => (
    typeof node?.session_id === 'string' && node.session_id !== '' && pinnedSessionIds.has(node.session_id)
  );
  const sortNodesPinnedFirst = (nodes: any[]): any[] => (
    [...nodes].sort((left, right) => Number(isNodePinned(right)) - Number(isNodePinned(left)))
  );

  /**
   * 节点会话菜单的动作。全部走宿主的 uiWorkspace / sessions 服务，
   * 这样置顶、归档、重命名的状态与侧栏其它地方保持一致。
   */
  const runSessionMenuAction = async (actionId: string, sessionId: string, node: any) => {
    const uiWorkspace = readClientService(ctx, 'uiWorkspace');
    try {
      if (actionId === 'pin') {
        if (pinnedSessionIds.has(sessionId)) await uiWorkspace?.unpinSession?.(sessionId);
        else await uiWorkspace?.pinSession?.(sessionId);
        return;
      }
      if (actionId === 'unarchive') {
        await uiWorkspace?.unarchiveSession?.(sessionId);
        return;
      }
      if (actionId === 'archive') {
        await uiWorkspace?.archiveSession?.(sessionId);
        return;
      }
      if (actionId === 'rename') {
        const summary = sessionsById[sessionId];
        runtime?.requestRenameSession?.(sessionId, summary?.title ?? node.title ?? '');
        return;
      }
      if (actionId === 'copy-id') {
        const copied = await writeClipboard(sessionId);
        if (copied !== true) console.warn('[dsh-agent-workflow] 复制会话 ID 失败');
      }
    } catch (error) {
      console.error('[dsh-agent-workflow] 会话菜单操作失败：', error);
    }
  };

  const renderNodeRow = (node: any, depth: number): any => {
    const sessionId = typeof node.session_id === 'string' && node.session_id !== '' ? node.session_id : null;
    const sessionSummary = sessionId === null ? undefined : sessionsById[sessionId];
    const sessionTitle = typeof sessionSummary?.title === 'string' ? sessionSummary.title.trim() : '';
    /** 行标题优先跟随会话名（重命名会话后立刻可见），没有会话名才回退节点标题。 */
    const displayTitle = sessionTitle !== '' ? sessionTitle : (node.title || '未命名会话');
    const isPinned = sessionId !== null && pinnedSessionIds.has(sessionId);
    const isArchived = sessionId !== null && archivedSessionIds.has(sessionId);
    const children = sortNodesPinnedFirst(
      (node.child_ids ?? [])
        .map((id: string) => byId.get(id))
        .filter((child: any) => child !== undefined),
    );
    /** 该节点绑定的会话正是当前打开的会话时，行保持选中态。 */
    const isCurrent = currentSessionId !== null
      && sessionId !== null
      && sessionId === currentSessionId;

    return (
      <div key={node.node_id}>
        <div
          role="treeitem"
          aria-selected={isCurrent}
          className={joinClasses(
            rowsClass('sessionRow'),
            isArchived && rowsClass('archived'),
            isCurrent && rowsClass('selected'),
          )}
          title={isArchived
            ? '该会话已归档，先在「⋯」里取消归档'
            : (busyNodeId === node.node_id ? '正在打开会话…' : '点击打开该节点的会话')}
          onClick={() => {
            if (isArchived) return;
            void openNodeSession(node);
          }}
          style={{
            paddingLeft: 4 + depth * 14,
            cursor: busyNodeId === node.node_id ? 'progress' : 'pointer',
            opacity: busyNodeId === node.node_id ? 0.6 : (isArchived ? 0.55 : 1),
          }}
        >
          <span className={rowsClass('slot')}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' }} />
          </span>
          <span className={rowsClass('title')}>{displayTitle}</span>
          <span className={rowsClass('rowResting')}>
            <span className={rowsClass('time')}>
              {isArchived
                ? '已归档'
                : (NODE_STATE_LABEL[node.current_state as keyof typeof NODE_STATE_LABEL] ?? node.current_state)}
            </span>
            {isPinned ? <IconPinFillRegular size={12} /> : null}
          </span>
          <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={rowsClass('iconButton')}
              aria-label="会话菜单"
              aria-haspopup="menu"
              aria-expanded={nodeMenu?.nodeId === node.node_id}
              onClick={(event) => {
                // 先把焦点落到触发按钮：菜单关闭时要把焦点还回来，
                // 否则菜单隐藏时焦点仍在菜单项上，浏览器会报 aria-hidden 警告。
                event.currentTarget.focus({ preventScroll: true });
                const point = menuPointFromEvent(event);
                setNodeMenu((current) => (
                  current !== null && current.nodeId === node.node_id ? null : { nodeId: node.node_id, ...point }
                ));
              }}
            >
              <IconEllipsisOutlineRegular />
            </button>
            {/* 操作细节：小齿轮。推进按钮已挪到会话里（状态徽标右侧）。 */}
            <Tooltip label="操作细节" side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className={rowsClass('iconButton')}
                aria-label="操作细节"
                onClick={() => setNodeDetailNodeId(node.node_id)}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
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
  /** 根节点的状态直接显示在工作区行上（根节点不再单独占一行）。 */
  const rootState = typeof rootNode?.current_state === 'string' ? rootNode.current_state : null;
  const rootNextState = rootState === null ? null : (NEXT_NODE_STATE[rootState] ?? null);
  const rootChildNodes = sortNodesPinnedFirst(
    (rootNode?.child_ids ?? [])
      .map((id: string) => byId.get(id))
      .filter((child: any) => child !== undefined),
  );

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
        {rootState !== null ? (
          <span className={rowsClass('rowResting')}>
            <span className={rowsClass('time')}>{NODE_STATE_LABEL[rootState as keyof typeof NODE_STATE_LABEL] ?? rootState}</span>
          </span>
        ) : null}
        <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={rowsClass('iconButton')}
            aria-label="工作区菜单"
            aria-haspopup="menu"
            aria-expanded={workspaceMenuPoint !== null}
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              const point = menuPointFromEvent(event);
              setWorkspaceMenuPoint((current) => (current === null ? point : null));
            }}
          >
            <IconEllipsisOutlineRegular />
          </button>
          {rootNode !== undefined ? (
            <Tooltip label={rootNextState === null ? '已完结' : `推进到 ${NODE_STATE_LABEL[rootNextState as keyof typeof NODE_STATE_LABEL] ?? rootNextState}`} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className={rowsClass('iconButton')}
                aria-label="推进到下一阶段"
                disabled={rootNextState === null}
                onClick={() => {
                  if (rootNextState !== null) void transition(rootNode.node_id, rootNextState);
                }}
                style={{ opacity: rootNextState === null ? 0.35 : 1 }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
                  <path d="M5 12h13" />
                  <path d="m12.5 6 6 6-6 6" />
                </svg>
              </button>
            </Tooltip>
          ) : null}
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
          ) : (
            rootChildNodes.map((child: any) => renderNodeRow(child, 1))
          )}
        </div>
      ) : null}

      {workspaceMenuPoint !== null ? (
        <Menu
          open
          anchor={null}
          portal
          getAnchorRect={() => menuAnchorRect(workspaceMenuPoint)}
          items={[
            { id: 'settings', label: '操作细节设置', icon: <IconEditOutlineRegular /> },
            { id: 'rename', label: '重命名', icon: <IconEditOutlineRegular /> },
            { id: 'delete', label: '删除工作区', icon: <IconTrashOutlineRegular />, danger: true },
          ]}
          onClose={() => setWorkspaceMenuPoint(null)}
          onSelect={(id: string) => {
            if (id === 'settings') {
              setSettingsDialogOpen(true);
              return;
            }
            // 跟 usual 工作区行一致：都交给宿主的工作区服务处理。
            const workspaceId = typeof summary.workspaceId === 'string' && summary.workspaceId !== ''
              ? summary.workspaceId
              : (typeof runtime?.findWorkspaceIdByPath === 'function' && typeof summary.path === 'string'
                ? runtime.findWorkspaceIdByPath(summary.path)
                : null);
            if (workspaceId === null || workspaceId === '') {
              console.error('[dsh-agent-workflow] 找不到对应的宿主工作区，无法执行该操作');
              return;
            }
            if (id === 'rename') runtime?.requestRenameWorkspace?.(workspaceId, summary.title ?? '');
            else if (id === 'delete') runtime?.requestDeleteWorkspace?.(workspaceId);
          }}
        />
      ) : null}

      {nodeMenu !== null ? (() => {
        const menuNode = byId.get(nodeMenu.nodeId);
        if (menuNode === undefined) return null;
        const menuSessionId = typeof menuNode.session_id === 'string' && menuNode.session_id !== ''
          ? menuNode.session_id
          : null;
        if (menuSessionId === null) {
          return (
            <Menu
              open
              anchor={null}
              portal
              getAnchorRect={() => menuAnchorRect(nodeMenu)}
              items={[{ id: 'child', label: '新建子会话' }]}
              onClose={() => setNodeMenu(null)}
              onSelect={(id: string) => {
                if (id === 'child') void addChildTo(menuNode.node_id);
              }}
            />
          );
        }

        const menuPinned = pinnedSessionIds.has(menuSessionId);
        const menuArchived = archivedSessionIds.has(menuSessionId);
        // 注意：这里不出现「分叉会话」——workflow 节点会话不允许分叉（会破坏节点与会话的一一对应）。
        const items = menuArchived
          ? [{ id: 'unarchive', label: '取消归档', icon: <IconUnarchiveOutlineRegular /> }]
          : [
            { id: 'pin', label: menuPinned ? '取消置顶' : '置顶会话', icon: <IconPinOutlineRegular /> },
            { id: 'rename', label: '重命名', icon: <IconEditOutlineRegular /> },
            { id: 'copy-id', label: '复制 Session ID', icon: <IconCopyOutlineRegular /> },
            { id: 'archive', label: '归档会话', icon: <IconArchiveOutlineRegular />, separatorBefore: true },
          ];
        return (
          <Menu
            open
            anchor={null}
            portal
            getAnchorRect={() => menuAnchorRect(nodeMenu)}
            items={items}
            onClose={() => setNodeMenu(null)}
            onSelect={(id: string) => void runSessionMenuAction(id, menuSessionId, menuNode)}
          />
        );
      })() : null}

      {settingsDialogOpen ? (
        <WorkflowSettingsDialog workflowId={summary.id} onClose={() => setSettingsDialogOpen(false)} />
      ) : null}
      {nodeDetailNodeId !== null ? (
        <WorkflowNodeDetailDialog
          workflowId={summary.id}
          nodeId={nodeDetailNodeId}
          onClose={() => setNodeDetailNodeId(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * 输入框工具条里的 workflow 状态徽标：
 * 当前会话若是某个 workflow 节点绑定的会话，就在权限控件右边显示该节点的状态。
 */
function WorkflowStateBadge(props: { sessionId?: string }) {
  const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
  const [nodeInfo, setNodeInfo] = useState<{ state: string; workflowId: string; nodeId: string } | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const readNode = async () => {
    try {
      const response = await fetch(`/dsh-agent-workflow/node-by-session?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await response.json().catch(() => null);
      const node = data?.ok === true ? data.node : null;
      setNodeInfo(node === null || node === undefined
        ? null
        : {
          state: String(node.current_state),
          workflowId: String(node.workflowId),
          nodeId: String(node.nodeId),
        });
    } catch {
      setNodeInfo(null);
    }
  };

  useEffect(() => {
    if (sessionId === '') {
      setNodeInfo(null);
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await readNode();
    };
    void tick();
    // 状态可能被侧栏的「推进」改掉，轮询轻量本地接口即可（每次只读一个小 JSON）。
    const timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  if (nodeInfo === null) return null;
  const label = NODE_STATE_LABEL[nodeInfo.state as keyof typeof NODE_STATE_LABEL] ?? nodeInfo.state;
  const nextState = NEXT_NODE_STATE[nodeInfo.state] ?? null;

  /** 「推进」按钮挪到了会话里（状态徽标右边）；逻辑暂时保持原样：直接写状态。 */
  const advance = async () => {
    if (nextState === null || advancing) return;
    setAdvancing(true);
    try {
      await fetch('/dsh-agent-workflow/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: nodeInfo.workflowId, nodeId: nodeInfo.nodeId, to: nextState }),
      });
      await readNode();
    } catch (error) {
      console.error('[dsh-agent-workflow] 推进状态失败：', error);
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        title="workflow 节点状态"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 22,
          padding: '0 8px',
          borderRadius: 6,
          background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-secondary)',
          fontSize: 11,
          lineHeight: '22px',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[nodeInfo.state] ?? 'transparent' }} />
        {label}
      </span>
      {nextState === null ? null : (
        <Tooltip label={`推进到 ${NODE_STATE_LABEL[nextState as keyof typeof NODE_STATE_LABEL] ?? nextState}`} side="top" delayMs={400} portal>
          <button
            type="button"
            aria-label="推进到下一阶段"
            disabled={advancing}
            onClick={() => void advance()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: advancing ? 'progress' : 'pointer',
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

export const workflowKindPlugin: WorkspaceKindPlugin = {
  kind: WorkspaceKind.Workflow,
  list: listWorkflows,
  create: createWorkflow,
  /**
   * 认领一个宿主目录工作区：优先按 workspaceId，旧快照没有就按目录路径比对。
   * 认领之后侧栏不再把它当 usual 渲染，同一个目录因此只有一行。
   */
  matchWorkspace: (item, workspace) => {
    const itemWorkspaceId = typeof item.workspaceId === 'string' ? item.workspaceId : null;
    const hostWorkspaceId = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : null;
    if (itemWorkspaceId !== null && hostWorkspaceId !== null) return itemWorkspaceId === hostWorkspaceId;
    const itemPath = typeof item.path === 'string' ? normalizeWorkspacePath(item.path) : '';
    const hostPath = typeof workspace.path === 'string' ? normalizeWorkspacePath(workspace.path) : '';
    return itemPath !== '' && hostPath !== '' && itemPath === hostPath;
  },
  renderItem: (summary, collapsed, onToggle, onChanged, runtime) => (
    <WorkflowWorkspaceItem
      summary={summary}
      collapsed={collapsed}
      onToggle={onToggle}
      onChanged={onChanged}
      runtime={runtime}
    />
  ),
};
