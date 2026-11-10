// @ts-nocheck
/**
 * 伪装层：注册 `sidebar.workspaces`，替换宿主的 WorkspaceBrowser。
 *
 * 结构照抄宿主 `@deepseek-ai/dsh-client-ui-workspace` 的会话行 / 工作区行 / 浏览器外壳；
 * 只改三处：数据来源（框架给的 useWorkspaces/useSessions）、翻译（本地 ZH 表）、
 * 砍掉暂不需要的拖拽 / 水印 / 动画。
 *
 * 关键契约（来自宿主源码）：
 * - single 槽同优先级会抛，所以用 priority: -1 压过宿主的 0；
 * - 子槽必须由正在渲染的这份注册声明，否则 renderSlot 拿不到条目；
 * - 菜单项经 renderSlot 第三参 { hookContext: [open, setOpen] } 传开合状态。
 */

import { Component, useEffect, useState } from 'react';
import { WorkspaceKind, WORKSPACE_KINDS } from './workspace-kind';
import { rowsClass, joinClasses, WorkspaceKindIcon } from './workspace-ui';
import { getWorkspaceKindPlugin, nonUsualWorkspaceKinds } from './workspace-kind-registry';
import {
  StateDot,
  IconPinFillRegular,
  IconEllipsisOutlineRegular,
  IconArchiveOutlineRegular,
  IconTriangleRightFillRegular,
  IconNewChatOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconFolderOpenRegular,
  IconFolderCloseRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  Menu,
  HoverCard,
  Tooltip,
  relativeTime,
} from '@deepseek-ai/dsh-client-ui-primitives';

/** 错误边界：槽位条目渲染失败只让那一块消失，不能让整个浏览器炸掉。 */
class EntryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('[dsh-agent-workflow] 槽位条目渲染失败：', this.props.label, error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ?? null;
  }
}

function Entry(props) {
  return (
    <EntryBoundary label={props.label} fallback={props.fallback}>
      {props.children}
    </EntryBoundary>
  );
}

function getService(ctx: any, name: string): any {
  if (ctx === undefined || ctx === null) return undefined;
  if (typeof ctx.get === 'function') {
    try {
      const viaGet = ctx.get(name);
      if (viaGet !== undefined && viaGet !== null) return viaGet;
    } catch {
      // 继续走属性访问
    }
  }
  try {
    return ctx[name];
  } catch {
    return undefined;
  }
}

/**
 * 定向屏蔽一条结构性、已知无害的 uncaught 错误：
 * `sidebar.workspaces` 是 single 槽，宿主与我们各有一份注册、都声明同一批子槽，
 * 后声明的那份（宿主）会抛 "slot ... is already declared"。它在宿主回调里抛，
 * 插件侧 catch 不到，只能按内容精确拦截。
 */
let workspaceSlotNoiseFilterInstalled = false;

function isWorkspaceSlotNoise(message: string): boolean {
  return message.includes('already declared') && message.includes('sidebar.workspaces');
}

function installWorkspaceSlotNoiseFilter(): void {
  if (workspaceSlotNoiseFilterInstalled) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  workspaceSlotNoiseFilterInstalled = true;

  window.addEventListener(
    'error',
    (event: any) => {
      if (!isWorkspaceSlotNoise(String(event?.message ?? ''))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event: any) => {
    const reason = event?.reason;
    if (!isWorkspaceSlotNoise(String(reason?.message ?? reason ?? ''))) return;
    event.preventDefault();
  });
}

/** 宿主 WorkspaceBrowser 模块里 stable 的类名。 */
const C = {
  root: 'GAkraW_root',
  iconButton: 'GAkraW_iconButton',
  wide: 'GAkraW_wide',
  rail: 'GAkraW_rail',
  sectionHeader: 'GAkraW_sectionHeader',
  sectionLabel: 'GAkraW_sectionLabel',
  search: 'GAkraW_search',
  searchInput: 'GAkraW_searchInput',
  listArea: 'GAkraW_listArea',
  list: 'GAkraW_list',
  treeBody: 'GAkraW_treeBody',
  emptyState: 'GAkraW_emptyState',
  empty: 'GAkraW_empty',
  headerActions: 'GAkraW_headerActions',
};

/** 翻译表：沿用宿主 t() 的语义，值换成本地中文。 */
const ZH: Record<string, string> = {
  'session.untitled': '未命名会话',
  'status.running': '进行中',
  'status.completed': '已完成',
  'status.idle': '空闲',
  'status.waitingApproval': '等待批准',
  'status.planReview': '待评审计划',
  'status.waitingAnswer': '等待回答',
  'status.subagentsRunning.one': '1 个子任务进行中',
  'status.subagentsRunning.other': '{n} 个子任务进行中',
  'time.now': '刚刚',
  'time.minutes': '{n} 分钟',
  'time.hours': '{n} 小时',
  'time.days': '{n} 天',
  'time.ago': '{t}前',
  'copy': '复制',
  'hover.copied': '已复制',
  'row.archived': '已归档',
};

function t(key: string, vars?: Record<string, any>): string {
  let text = ZH[key] ?? key;
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
  }
  return text;
}

function displayTitle(node: any): string {
  return node.title || t('session.untitled');
}

/** 照抄宿主 sessionStatuses：pending 优先，running 次之，子任务，完成，空闲。 */
function sessionStatuses(node: any): Array<{ state: string; label: string; trailingLabel?: string }> {
  const subagentCount = typeof node.runningSubagentCount === 'number' && node.runningSubagentCount > 0
    ? node.runningSubagentCount
    : 0;
  const subagents = subagentCount === 0
    ? undefined
    : {
        state: 'ongoing',
        label: t(subagentCount === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: subagentCount }),
      };

  let pending: { state: string; label: string; trailingLabel?: string } | undefined;
  switch (node.pendingInteraction) {
    case 'approval':
      pending = { state: 'warning', label: t('status.waitingApproval') };
      break;
    case 'plan-review':
      pending = { state: 'warning', label: t('status.planReview') };
      break;
    case 'question':
      pending = { state: 'warning', label: t('status.waitingAnswer') };
      break;
    default:
      break;
  }

  if (pending !== undefined) return subagents === undefined ? [pending] : [pending, subagents as any];
  if (node.running) {
    const primary = { state: 'ongoing', label: t('status.running') };
    return subagents === undefined ? [primary] : [primary, subagents as any];
  }
  if (subagents !== undefined) return [subagents as any];
  if (node.completed) return [{ state: 'done', label: t('status.completed') }];
  return [{ state: 'idle', label: t('status.idle') }];
}

function timeLabel(updatedAt: string | undefined, now: number): string {
  if (!updatedAt) return '';
  const { unit, n } = relativeTime(updatedAt, now);
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n });
}

function hoverTimeLabel(updatedAt: string | undefined, now: number): string {
  if (!updatedAt) return '';
  const { unit, n } = relativeTime(updatedAt, now);
  return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) });
}

function SessionStatusDots(props: { statuses: Array<{ state: string; label: string }> }) {
  return (
    <>
      <StateDot state={props.statuses[0].state as any} />
      {props.statuses.map((status) => (
        <span key={status.label} className={rowsClass('visuallyHidden')}>{status.label}</span>
      ))}
    </>
  );
}

function PinnedIndicator() {
  return (
    <span className={rowsClass('pinIndicator')} role="img" aria-label="置顶" title="置顶">
      <IconPinFillRegular size={14} />
    </span>
  );
}

function WorkspaceHoverContent(props: { ws: any }) {
  const { ws } = props;
  return (
    <div className={rowsClass('hoverContent')}>
      <div className={rowsClass('hoverTitle')}>{ws.title || '未命名工作区'}</div>
      {ws.path ? <div className={rowsClass('hoverTime')}>{ws.path}</div> : null}
    </div>
  );
}

/** 照抄宿主 ProjectRowItem：folder + chevron + projectText + Menu（rename/delete）+ 新建会话。 */
function WorkspaceNodeItem(props: {
  ws: any;
  expanded: boolean;
  label: string;
  onToggle: () => void;
  onNewSession: () => void;
  onRenameRequest: () => void;
  onDelete: () => void;
}) {
  const { ws, expanded, label, onToggle, onNewSession, onRenameRequest, onDelete } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    { id: 'rename', label: '重命名', icon: <IconEditOutlineRegular /> },
    { id: 'delete', label: '删除工作区', icon: <IconTrashOutlineRegular />, danger: true },
  ];

  const row = (
    <div
      role="treeitem"
      data-row-key={`workspace:${ws.workspaceId ?? ws.path}`}
      aria-expanded={expanded}
      className={joinClasses(rowsClass('projectRow'), menuOpen && rowsClass('menuOpen'))}
      onClick={onToggle}
    >
      {/* 宿主老图里文件夹是固定的强调蓝；token 在本主题下不一定解析成蓝，直接用字面色更稳。 */}
      <span
        className={joinClasses(rowsClass('slot'), rowsClass('folder'))}
        style={{ color: '#4d7bfd' }}
      >
        {expanded ? <IconFolderOpenRegular color="#4d7bfd" /> : <IconFolderCloseRegular color="#4d7bfd" />}
      </span>
      <span className={joinClasses(rowsClass('slot'), rowsClass('chevron'))}>
        <IconTriangleRightFillRegular className={joinClasses(rowsClass('arrow'), expanded && rowsClass('arrowOpen'))} />
      </span>
      <span className={rowsClass('projectText')}>
        <span className={rowsClass('title')}>{label}</span>
      </span>
      <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={items}
          onSelect={(id: string) => {
            setMenuOpen(false);
            if (id === 'rename') onRenameRequest();
            else onDelete();
          }}
          portal
          closeOnPointerLeave
          anchor={(
            <button type="button" className={rowsClass('iconButton')} aria-label="工作区菜单" onClick={() => setMenuOpen((value) => !value)}>
              <IconEllipsisOutlineRegular />
            </button>
          )}
        />
        <Tooltip label="新建会话" side="bottom" align="end" delayMs={500} portal>
          <button type="button" className={rowsClass('iconButton')} aria-label="新建会话" onClick={onNewSession}>
            <IconNewChatOutlineRegular />
          </button>
        </Tooltip>
      </span>
    </div>
  );

  return (
    <HoverCard
      anchor={row}
      content={<WorkspaceHoverContent ws={ws} />}
      openDelayMs={800}
      grouped
      copyText={ws.path}
      copyLabel={t('copy')}
      copiedLabel={t('hover.copied')}
    />
  );
}

/** 视图选项：分组 / 排序 / 归档过滤。 */
function ViewOptionsMenu(props: {
  groupBy: string;
  orderBy: string;
  archivedFilter: string;
  onChange: (patch: Partial<{ groupBy: string; orderBy: string; archivedFilter: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const archivedFilterToId: Record<string, string> = {
    default: 'hide-archived',
    show: 'show-archived',
    only: 'only-archived',
  };
  const items = [
    { id: 'workspace', label: '按工作区分组' },
    { id: 'workspace-tree', label: '工作区树' },
    { id: 'flat', label: '平铺' },
    { type: 'separator', id: 'sep-order' },
    { id: 'manual', label: '手动排序' },
    { id: 'updated', label: '按更新时间' },
    { type: 'separator', id: 'sep-filter' },
    { type: 'label', id: 'filter-by', text: '归档过滤' },
    { id: 'hide-archived', label: '隐藏已归档' },
    { id: 'show-archived', label: '显示已归档' },
    { id: 'only-archived', label: '只看已归档' },
  ];

  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      selectedIds={[props.groupBy, props.orderBy, archivedFilterToId[props.archivedFilter]]}
      onSelect={(id: string) => {
        setOpen(false);
        if (id === 'workspace' || id === 'workspace-tree' || id === 'flat') props.onChange({ groupBy: id });
        else if (id === 'manual' || id === 'updated') props.onChange({ orderBy: id });
        else if (id === 'hide-archived') props.onChange({ archivedFilter: 'default' });
        else if (id === 'show-archived') props.onChange({ archivedFilter: 'show' });
        else if (id === 'only-archived') props.onChange({ archivedFilter: 'only' });
      }}
      align="end"
      dense
      portal
      anchor={(
        <Tooltip label="视图选项" side="bottom" delayMs={500} portal>
          <button type="button" className={rowsClass('iconButton')} aria-label="视图选项" onClick={() => setOpen((value) => !value)}>
            <IconSlidersTwoOutlineRegular />
          </button>
        </Tooltip>
      )}
    />
  );
}

/** 「添加工作区」下拉框：按 WORKSPACE_KINDS 枚举渲染，几类几个选项。 */
function AddWorkspaceMenu(props: { onSelectKind: (kind: WorkspaceKind) => void }) {
  const [open, setOpen] = useState(false);
  const items = WORKSPACE_KINDS.map((kind) => ({
    id: kind.id,
    label: kind.label,
    icon: <WorkspaceKindIcon kind={kind.id} size={14} />,
  }));

  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      onSelect={(id: string) => {
        setOpen(false);
        props.onSelectKind(id as WorkspaceKind);
      }}
      align="end"
      portal
      anchor={(
        <Tooltip label="新建工作区" side="bottom" align="end" delayMs={500} portal>
          <button type="button" className={C.iconButton} aria-label="添加工作区" onClick={() => setOpen((value) => !value)}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
              <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h8A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z" />
              <path d="M11.5 11v4M9.5 13h4" />
            </svg>
          </button>
        </Tooltip>
      )}
    />
  );
}

function SessionHoverContent(props: { node: any; renderSlot: any }) {
  const { node, renderSlot } = props;
  const now = Date.now();
  const statuses = sessionStatuses(node).filter(
    (status) => !(node.archived && (status.state === 'done' || status.state === 'idle')),
  );
  return (
    <div className={rowsClass('hoverContent')}>
      <div className={rowsClass('hoverTitle')}>{displayTitle(node)}</div>
      {!node.blank ? <div className={rowsClass('hoverTime')}>{hoverTimeLabel(node.updatedAt, now)}</div> : null}
      {typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.hover', { sessionId: node.id }) : null}
      {statuses.map((status) => (
        <div key={status.label} className={rowsClass('hoverStatus')}>
          <StateDot state={status.state as any} />
          <span>{status.label}</span>
        </div>
      ))}
      {node.archived ? (
        <div className={joinClasses(rowsClass('hoverStatus'), rowsClass('hoverArchived'))}>
          <IconArchiveOutlineRegular size={14} />
          <span>{t('row.archived')}</span>
        </div>
      ) : null}
    </div>
  );
}

/** 会话行：slot / title / time / rowActions + HoverCard；「⋯」直接打开宿主的上下文菜单。 */
function SessionRow(props: {
  node: any;
  onOpen: (id: string) => void;
  renderSlot: any;
  onOpenMenu: (sessionId: string, displayTitle: string, event: any) => void;
}) {
  const { node, onOpen, renderSlot, onOpenMenu } = props;
  const statuses = sessionStatuses(node);
  const primaryStatus = statuses[0];
  const showStatus = primaryStatus.state !== 'idle';
  const now = Date.now();

  const row = (
    <div
      role="treeitem"
      data-row-key={`session:${node.id}`}
      className={joinClasses(rowsClass('sessionRow'), node.archived && rowsClass('archived'))}
      onClick={() => onOpen(node.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(node.id, node.title ?? '', event);
      }}
    >
      <span className={rowsClass('slot')}>
        {!node.archived && !node.blank && (showStatus
          ? <SessionStatusDots statuses={statuses} />
          : (typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.leading', { sessionId: node.id }) : null))}
      </span>
      <span className={rowsClass('title')}>{displayTitle(node)}</span>
      {!node.blank ? (
        <span className={rowsClass('time')} aria-hidden>{primaryStatus.trailingLabel ?? timeLabel(node.updatedAt, now)}</span>
      ) : null}
      {node.pinned && !node.archived ? <PinnedIndicator /> : null}
      {!node.blank ? (
        <span className={rowsClass('rowActions')} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={rowsClass('iconButton')}
            aria-label="会话菜单"
            onClick={(event) => onOpenMenu(node.id, node.title ?? '', event)}
          >
            <IconEllipsisOutlineRegular />
          </button>
          {typeof renderSlot === 'function' ? (
            <Entry label="session.row.action">
              {renderSlot('sidebar.workspaces.session.row.action', { sessionId: node.id, displayTitle: node.title ?? '' })}
            </Entry>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  return (
    <HoverCard
      anchor={row}
      content={<SessionHoverContent node={node} renderSlot={renderSlot} />}
      openDelayMs={800}
      grouped
      copyText={node.blank || node.title === '' ? undefined : node.title}
      copyLabel={t('copy')}
      copiedLabel={t('hover.copied')}
    />
  );
}

export function applyWorkspaceBrowser(ctx: any) {
  installWorkspaceSlotNoiseFilter();

  // 注意：DSH 新版把 `sidebar.workspaces.session.menu.item` 移到了 `contextMenu.content` 下，
  // 不再属于这个槽；继续声明它会让整份注册失败（占位者消失、回落到宿主原生浏览器）。

  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces',
        // single 槽：宿主也在 0 注册，同优先级会抛；数字越低越渲染，用 -1 压过它。
        priority: -1,
        // 子槽必须由正在渲染的这份注册声明，否则 renderSlot 拿不到条目。
        children: {
          'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
          'sidebar.workspaces.session.row.action': { kind: 'list', scope: 'root' },
          'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
          'sidebar.session.row.trailing': { kind: 'list', scope: 'root' },
          'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
        },
      },
      (frameworkProps: any) => (
        <Entry
          label="workspace-browser"
          fallback={(
            <div style={{ padding: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>
              工作区渲染失败，详情见控制台
              <br />
              （dsh-agent-workflow）
            </div>
          )}
        >
          <WorkspaceBrowser ctx={ctx} {...frameworkProps} />
        </Entry>
      ),
    ),
  );

}

function WorkspaceBrowser(props: any) {
  const { ctx, wide, renderSlot, useWorkspaces, useSessions } = props;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(() => new Set());
  const [viewOptions, setViewOptions] = useState<{ groupBy: string; orderBy: string; archivedFilter: string }>({
    groupBy: 'workspace',
    orderBy: 'manual',
    archivedFilter: 'default',
  });
  /** 重命名对话框（工作区 / 会话共用）：Electron 不支持 window.prompt，必须自绘。 */
  const [renameTarget, setRenameTarget] = useState<{ kind: 'workspace' | 'session'; id: string; title: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  /** 非 usual 工作区（由类型插件注册）的列表，按 kind 分组。 */
  const [pluginItems, setPluginItems] = useState<Record<string, any[]>>({});
  /** 折叠的非 usual 工作区 id（key = `${kind}:${id}`）。 */
  const [collapsedPlugin, setCollapsedPlugin] = useState<Set<string>>(() => new Set());

  /** 拉取所有非 usual 工作区类型插件的列表（启动时 + 新建后复用）。 */
  const loadPluginLists = async () => {
    const next: Record<string, any[]> = {};
    for (const kind of nonUsualWorkspaceKinds()) {
      const plugin = getWorkspaceKindPlugin(kind);
      if (plugin === undefined) continue;
      try {
        next[kind] = await plugin.list();
      } catch (error) {
        console.error(`[dsh-agent-workflow] 读取 ${kind} 工作区列表失败：`, error);
        next[kind] = [];
      }
    }
    setPluginItems(next);
  };

  useEffect(() => {
    void loadPluginLists();
  }, []);

  const workspacesSnapshot = typeof useWorkspaces === 'function' ? useWorkspaces((s: any) => s) : null;
  const sessionsSnapshot = typeof useSessions === 'function' ? useSessions((s: any) => s) : null;

  const workspaceItems: any[] = workspacesSnapshot?.items ?? [];
  const sessionsById: Record<string, any> = sessionsSnapshot?.byId ?? {};

  const uiWorkspace = getService(ctx, 'uiWorkspace');
  const workspacesSvc = getService(ctx, 'workspaces');

  const openSession = (sessionId: string) => {
    try {
      if (typeof uiWorkspace?.openSession !== 'function') {
        console.error('[dsh-agent-workflow] uiWorkspace.openSession 不可用');
        return;
      }
      uiWorkspace.openSession(sessionId);
    } catch (error) {
      console.error('[dsh-agent-workflow] openSession 失败：', error);
    }
  };

  /** 按类型新建工作区：usual 走宿主；其它类型交给对应插件（解耦点只有枚举 + 注册表）。 */
  const addWorkspace = async (kind: WorkspaceKind) => {
    const picker = getService(ctx, 'uiWorkspace');
    if (typeof picker?.pickDirectory !== 'function') return;
    try {
      const path = await picker.pickDirectory();
      if (typeof path !== 'string' || path === '') return;
      if (kind === WorkspaceKind.Usual) {
        await workspacesSvc?.create?.({ path });
        return;
      }
      const plugin = getWorkspaceKindPlugin(kind);
      if (plugin === undefined) {
        console.error(`[dsh-agent-workflow] 未注册的工作区类型：${kind}`);
        return;
      }
      await plugin.create(path);
      await loadPluginLists();
    } catch (error) {
      console.error('[dsh-agent-workflow] 新建工作区失败：', error);
    }
  };

  const toggleWorkspace = (workspaceId: string) => {
    setCollapsedWorkspaces((previous) => {
      const next = new Set(previous);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  const startSession = (workspaceId: string) => {
    try {
      uiWorkspace?.startSession?.(workspaceId);
    } catch (error) {
      console.error('[dsh-agent-workflow] startSession 失败：', error);
    }
  };

  const renameWorkspace = async (workspaceId: string, title: string) => {
    try {
      await workspacesSvc?.rename?.(workspaceId, title);
    } catch (error) {
      console.error('[dsh-agent-workflow] 重命名工作区失败：', error);
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    try {
      await workspacesSvc?.delete?.(workspaceId);
    } catch (error) {
      console.error('[dsh-agent-workflow] 删除工作区失败：', error);
    }
  };

  /** 重命名会话：照抄宿主 renameSession（sessions.using → binding.session.rename）。 */
  const renameSession = async (sessionId: string, title: string) => {
    try {
      const sessionsSvc = getService(ctx, 'sessions');
      if (typeof sessionsSvc?.using !== 'function') {
        console.error('[dsh-agent-workflow] sessions.using 不可用，无法重命名会话');
        return;
      }
      const result = await sessionsSvc.using(sessionId, { source: 'workspaceOperation' }, (reference: any) =>
        reference.binding.session.rename(title),
      );
      if (result !== undefined && result.ok === false) throw new Error(result.error?.message ?? '重命名失败');
    } catch (error) {
      console.error('[dsh-agent-workflow] 重命名会话失败：', error);
    }
  };

  /** 点击归档会话 = 取消归档（宿主行为：归档会话不可直接打开）。 */
  const unarchiveSession = async (sessionId: string) => {
    try {
      await uiWorkspace?.unarchiveSession?.(sessionId);
    } catch (error) {
      console.error('[dsh-agent-workflow] 取消归档失败：', error);
    }
  };

  /**
   * 打开宿主的会话上下文菜单（照抄宿主 `browserInjected.openSessionMenu`）。
   * 菜单项由宿主自己通过 `ctx.contextMenus.register` 注册，我们只负责把它打开。
   */
  const openSessionMenu = (sessionId: string, displayTitle: string, event: any) => {
    const contextMenus = getService(ctx, 'contextMenus');
    if (contextMenus === undefined || contextMenus === null) {
      console.error('[dsh-agent-workflow] contextMenus 服务不可用，无法打开会话菜单');
      return;
    }
    try {
      const active = typeof contextMenus.active?.getSnapshot === 'function' ? contextMenus.active.getSnapshot() : undefined;
      if (active?.kind === 'session' && active.value?.sessionId === sessionId) {
        contextMenus.close();
        return;
      }
      const point = event !== undefined && typeof event.clientX === 'number'
        ? { x: event.clientX, y: event.clientY }
        : undefined;
      contextMenus.open({ kind: 'session', value: { sessionId, displayTitle } }, point);
    } catch (error) {
      console.error('[dsh-agent-workflow] 打开会话菜单失败：', error);
    }
  };

  const keyword = query.trim().toLowerCase();

  const renderSessionRow = (session: any) => (
    <SessionRow
      key={session.id}
      node={session}
      onOpen={session.archived ? unarchiveSession : openSession}
      renderSlot={renderSlot}
      onOpenMenu={openSessionMenu}
    />
  );

  const archivedSessionIds: Set<string> = new Set(workspacesSnapshot?.archivedSessionIds ?? []);
  // 置顶读宿主的 pinnedSessionIds（宿主自己的置顶星标/菜单项本来就能用）。
  const pinnedSet: Set<string> = new Set(workspacesSnapshot?.pinnedSessionIds ?? []);
  const decorateSession = (summary: any): any | null =>
    summary === undefined || summary === null
      ? null
      : { ...summary, archived: archivedSessionIds.has(summary.id), pinned: pinnedSet.has(summary.id) };

  const archiveVisible = (s: any): boolean => {
    if (viewOptions.archivedFilter === 'only') return s.archived === true;
    if (viewOptions.archivedFilter === 'show') return true;
    return s.archived !== true;
  };

  const buildWorkspaceSessions = (ws: any): any[] => {
    const list = (ws.sessionIds ?? [])
      .map((id: string) => decorateSession(sessionsById[id]))
      .filter((s: any): s is any => s !== null && s.blank !== true && archiveVisible(s))
      .filter((s: any) => keyword === '' || (s.title ?? '').toLowerCase().includes(keyword));
    // 置顶只作用于本工作区：置顶的排最前，其余保持原顺序（或按更新时间）。
    return [...list].sort((a, b) => {
      const pinnedDelta = Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id));
      if (pinnedDelta !== 0) return pinnedDelta;
      if (viewOptions.orderBy === 'updated') return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      return 0;
    });
  };

  const flatSessions = workspaceItems.flatMap((ws: any) => buildWorkspaceSessions(ws));

  return (
    <div
      className={joinClasses(C.root, wide ? C.wide : C.rail)}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      {/* 表头：标题在左、图标靠右；搜索点开后原地展开成输入框（和宿主一致）。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          minHeight: 34,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>工作区</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip label={searchOpen ? '关闭搜索' : '搜索'} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className={C.iconButton}
              aria-label={searchOpen ? '关闭搜索' : '搜索'}
              onClick={() => {
                if (searchOpen) {
                  setQuery('');
                  setSearchOpen(false);
                } else {
                  setSearchOpen(true);
                }
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden style={{ display: 'block' }}>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
            </button>
          </Tooltip>
          <ViewOptionsMenu
            groupBy={viewOptions.groupBy}
            orderBy={viewOptions.orderBy}
            archivedFilter={viewOptions.archivedFilter}
            onChange={(patch) => setViewOptions((previous) => ({ ...previous, ...patch }))}
          />
          <AddWorkspaceMenu onSelectKind={(kind) => void addWorkspace(kind)} />
        </div>
      </div>

      {/* 搜索：单独一行、整宽胶囊，左放大镜 + 中输入框 + 右清除（与宿主老版一致）。 */}
      {searchOpen ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            margin: '0 8px 6px',
            padding: '0 8px',
            height: 32,
            boxSizing: 'border-box',
            borderRadius: 9,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-2)',
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--dsw-alias-label-secondary)" strokeWidth={1.8} strokeLinecap="round" aria-hidden style={{ flex: 'none' }}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            autoFocus
            value={query}
            placeholder="搜索会话名称"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                setSearchOpen(false);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-primary)',
              font: 'inherit',
              fontSize: 13,
            }}
          />
          {query !== '' ? (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => setQuery('')}
              style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0, border: 'none', borderRadius: 4, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}


      <div className={C.listArea} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {flatSessions.length === 0 && Object.values(pluginItems).every((items) => items.length === 0) ? (
          <div className={C.emptyState}>
            <div className={C.empty}>{keyword === '' ? '还没有工作区' : '没有匹配的会话'}</div>
          </div>
        ) : (
          <div className={C.list}>
            {viewOptions.groupBy === 'flat' ? (
              flatSessions.map(renderSessionRow)
            ) : (
              <>
                {workspaceItems.map((ws: any) => {
                  const wsId = ws.workspaceId ?? ws.path;
                  const isCollapsed = collapsedWorkspaces.has(wsId);
                  const wsSessions = buildWorkspaceSessions(ws);
                  return (
                    <div
                      key={wsId}
                      className={rowsClass('groupSection')}
                      style={{ display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }}
                    >
                      <WorkspaceNodeItem
                        ws={ws}
                        expanded={!isCollapsed}
                        label={ws.title}
                        onToggle={() => toggleWorkspace(wsId)}
                        onNewSession={() => startSession(wsId)}
                        onRenameRequest={() => {
                          setRenameTarget({ kind: 'workspace', id: wsId, title: ws.title ?? '' });
                          setRenameDraft(ws.title ?? '');
                        }}
                        onDelete={() => void deleteWorkspace(wsId)}
                      />
                      {isCollapsed ? null : wsSessions.map(renderSessionRow)}
                    </div>
                  );
                })}
                {nonUsualWorkspaceKinds().flatMap((kind) => {
                  const plugin = getWorkspaceKindPlugin(kind);
                  if (plugin === undefined) return [];
                  // 置顶的排前面（只影响同一类型内部的顺序）。
                  const items = [...(pluginItems[kind] ?? [])].sort(
                    (left: any, right: any) => Number(right.pinned === true) - Number(left.pinned === true),
                  );
                  return items.map((summary: any) => {
                    const key = `${kind}:${summary.id}`;
                    const isCollapsed = collapsedPlugin.has(key);
                    return (
                      <div key={key}>
                        {plugin.renderItem(summary, isCollapsed, () => {
                          setCollapsedPlugin((previous) => {
                            const next = new Set(previous);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }, () => void loadPluginLists())}
                      </div>
                    );
                  });
                })}
              </>
            )}
          </div>
        )}
      </div>

      {renameTarget !== null ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }}
          onClick={() => setRenameTarget(null)}
        >
          <div
            style={{
              minWidth: 320,
              padding: 16,
              borderRadius: 10,
              background: 'var(--dsw-alias-bg-overlay)',
              border: '1px solid var(--dsw-alias-border-l1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              color: 'var(--dsw-alias-label-primary)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {renameTarget.kind === 'workspace' ? '重命名工作区' : '重命名会话'}
            </div>
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const value = renameDraft.trim();
                  if (value !== '') {
                    if (renameTarget.kind === 'workspace') void renameWorkspace(renameTarget.id, value);
                    else void renameSession(renameTarget.id, value);
                  }
                  setRenameTarget(null);
                } else if (event.key === 'Escape') {
                  setRenameTarget(null);
                }
              }}
              style={{
                boxSizing: 'border-box',
                height: 30,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-base)',
                color: 'var(--dsw-alias-label-primary)',
                font: 'inherit',
                fontSize: 13,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-border-l1)',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const value = renameDraft.trim();
                  if (value !== '') {
                    if (renameTarget.kind === 'workspace') void renameWorkspace(renameTarget.id, value);
                    else void renameSession(renameTarget.id, value);
                  }
                  setRenameTarget(null);
                }}
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--dsw-alias-brand-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
