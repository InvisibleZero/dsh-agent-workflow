import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Component, useEffect, useRef, useState } from 'react';
import { WorkspaceKind, WORKSPACE_KINDS } from './workspace-kind';
import { rowsClass, joinClasses, WorkspaceKindIcon, menuPointFromEvent, menuAnchorRect } from './workspace-ui';
import { getWorkspaceKindPlugin, nonUsualWorkspaceKinds, normalizeWorkspacePath } from './workspace-kind-registry';
import { StateDot, IconPinFillRegular, IconEllipsisOutlineRegular, IconArchiveOutlineRegular, IconTriangleRightFillRegular, IconNewChatOutlineRegular, IconSlidersTwoOutlineRegular, IconSearchOutlineRegular, IconCloseFillRegular, IconProjectAddOutlineRegular, IconChevronsUpDownOutlineRegular, IconClockOutlineRegular, IconWorkspaceTreeOutlineRegular, IconFlatListOutlineRegular, IconArchiveOffOutlineRegular, IconQueueOutlineRegular, IconArchiveCheckOutlineRegular, IconFolderOpenRegular, IconFolderCloseRegular, IconEditOutlineRegular, IconTrashOutlineRegular, Menu, HoverCard, Tooltip, relativeTime, } from '@deepseek-ai/dsh-client-ui-primitives';
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
        if (!this.state.failed)
            return this.props.children;
        return this.props.fallback ?? null;
    }
}
function Entry(props) {
    return (_jsx(EntryBoundary, { label: props.label, fallback: props.fallback, children: props.children }));
}
function getService(ctx, name) {
    if (ctx === undefined || ctx === null)
        return undefined;
    if (typeof ctx.get === 'function') {
        try {
            const viaGet = ctx.get(name);
            if (viaGet !== undefined && viaGet !== null)
                return viaGet;
        }
        catch {
            // 继续走属性访问
        }
    }
    try {
        return ctx[name];
    }
    catch {
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
function isWorkspaceSlotNoise(message) {
    return message.includes('already declared') && message.includes('sidebar.workspaces');
}
function installWorkspaceSlotNoiseFilter() {
    if (workspaceSlotNoiseFilterInstalled)
        return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function')
        return;
    workspaceSlotNoiseFilterInstalled = true;
    window.addEventListener('error', (event) => {
        if (!isWorkspaceSlotNoise(String(event?.message ?? '')))
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason;
        if (!isWorkspaceSlotNoise(String(reason?.message ?? reason ?? '')))
            return;
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
    sectionLabelHidden: 'GAkraW_sectionLabelHidden',
    searchSlot: 'GAkraW_searchSlot',
    searchSlotExpanded: 'GAkraW_searchSlotExpanded',
    search: 'GAkraW_search',
    searchExpanded: 'GAkraW_searchExpanded',
    searchButton: 'GAkraW_searchButton',
    searchInput: 'GAkraW_searchInput',
    clearButton: 'GAkraW_clearButton',
    searchSpacingMotion: 'GAkraW_searchSpacingMotion',
    listArea: 'GAkraW_listArea',
    list: 'GAkraW_list',
    treeBody: 'GAkraW_treeBody',
    emptyState: 'GAkraW_emptyState',
    empty: 'GAkraW_empty',
    headerActions: 'GAkraW_headerActions',
    headerActionsHidden: 'GAkraW_headerActionsHidden',
    viewOptionsMenu: 'GAkraW_viewOptionsMenu',
};
/** 翻译表：沿用宿主 t() 的语义，值换成本地中文。 */
const ZH = {
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
function t(key, vars) {
    let text = ZH[key] ?? key;
    if (vars !== undefined) {
        for (const [name, value] of Object.entries(vars))
            text = text.replace(`{${name}}`, String(value));
    }
    return text;
}
function displayTitle(node) {
    return node.title || t('session.untitled');
}
/** 照抄宿主 sessionStatuses：pending 优先，running 次之，子任务，完成，空闲。 */
function sessionStatuses(node) {
    const subagentCount = typeof node.runningSubagentCount === 'number' && node.runningSubagentCount > 0
        ? node.runningSubagentCount
        : 0;
    const subagents = subagentCount === 0
        ? undefined
        : {
            state: 'ongoing',
            label: t(subagentCount === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: subagentCount }),
        };
    let pending;
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
    if (pending !== undefined)
        return subagents === undefined ? [pending] : [pending, subagents];
    if (node.running) {
        const primary = { state: 'ongoing', label: t('status.running') };
        return subagents === undefined ? [primary] : [primary, subagents];
    }
    if (subagents !== undefined)
        return [subagents];
    if (node.completed)
        return [{ state: 'done', label: t('status.completed') }];
    return [{ state: 'idle', label: t('status.idle') }];
}
function timeLabel(updatedAt, now) {
    if (!updatedAt)
        return '';
    const { unit, n } = relativeTime(updatedAt, now);
    return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n });
}
function hoverTimeLabel(updatedAt, now) {
    if (!updatedAt)
        return '';
    const { unit, n } = relativeTime(updatedAt, now);
    return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) });
}
function SessionStatusDots(props) {
    return (_jsxs(_Fragment, { children: [_jsx(StateDot, { state: props.statuses[0].state }), props.statuses.map((status) => (_jsx("span", { className: rowsClass('visuallyHidden'), children: status.label }, status.label)))] }));
}
function PinnedIndicator() {
    return (_jsx("span", { className: rowsClass('pinIndicator'), role: "img", "aria-label": "\u7F6E\u9876", title: "\u7F6E\u9876", children: _jsx(IconPinFillRegular, { size: 14 }) }));
}
function WorkspaceHoverContent(props) {
    const { ws } = props;
    return (_jsxs("div", { className: rowsClass('hoverContent'), children: [_jsx("div", { className: rowsClass('hoverTitle'), children: ws.title || '未命名工作区' }), ws.path ? _jsx("div", { className: rowsClass('hoverTime'), children: ws.path }) : null] }));
}
/** 照抄宿主 ProjectRowItem：folder + chevron + projectText + Menu（rename/delete）+ 新建会话。 */
function WorkspaceNodeItem(props) {
    const { ws, expanded, label, onToggle, onNewSession, onRenameRequest, onDelete } = props;
    const [menuPoint, setMenuPoint] = useState(null);
    const items = [
        { id: 'rename', label: '重命名', icon: _jsx(IconEditOutlineRegular, {}) },
        { id: 'delete', label: '删除工作区', icon: _jsx(IconTrashOutlineRegular, {}), danger: true },
    ];
    const row = (_jsxs("div", { role: "treeitem", "data-row-key": `workspace:${ws.workspaceId ?? ws.path}`, "aria-expanded": expanded, className: joinClasses(rowsClass('projectRow'), menuPoint !== null && rowsClass('menuOpen')), onClick: onToggle, children: [_jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('folder')), style: { color: '#4d7bfd' }, children: expanded ? _jsx(IconFolderOpenRegular, { color: "#4d7bfd" }) : _jsx(IconFolderCloseRegular, { color: "#4d7bfd" }) }), _jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('chevron')), children: _jsx(IconTriangleRightFillRegular, { className: joinClasses(rowsClass('arrow'), expanded && rowsClass('arrowOpen')) }) }), _jsx("span", { className: rowsClass('projectText'), children: _jsx("span", { className: rowsClass('title'), children: label }) }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": menuPoint !== null, onClick: (event) => {
                            event.currentTarget.focus({ preventScroll: true });
                            const point = menuPointFromEvent(event);
                            setMenuPoint((current) => (current === null ? point : null));
                        }, children: _jsx(IconEllipsisOutlineRegular, {}) }), menuPoint !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(menuPoint), items: items, onClose: () => setMenuPoint(null), onSelect: (id) => {
                            setMenuPoint(null);
                            if (id === 'rename')
                                onRenameRequest();
                            else
                                onDelete();
                        } })) : null, _jsx(Tooltip, { label: "\u65B0\u5EFA\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD", onClick: onNewSession, children: _jsx(IconNewChatOutlineRegular, {}) }) })] })] }));
    return (_jsx(HoverCard, { anchor: row, content: _jsx(WorkspaceHoverContent, { ws: ws }), openDelayMs: 800, grouped: true, copyText: ws.path, copyLabel: t('copy'), copiedLabel: t('hover.copied') }));
}
/** 视图选项：分组 / 排序 / 归档过滤。 */
function ViewOptionsMenu(props) {
    const [point, setPoint] = useState(null);
    const archivedFilterToId = {
        default: 'hide-archived',
        show: 'show-archived',
        only: 'only-archived',
    };
    const items = [
        { type: 'label', id: 'group-by', text: '分组方式' },
        { id: 'workspace', label: '按工作区分组', icon: _jsx(IconFolderCloseRegular, {}) },
        { id: 'workspace-tree', label: '工作区树', icon: _jsx(IconWorkspaceTreeOutlineRegular, {}) },
        { id: 'flat', label: '平铺', icon: _jsx(IconFlatListOutlineRegular, {}) },
        { type: 'separator', id: 'sep-order' },
        { type: 'label', id: 'order-by', text: '排序方式' },
        { id: 'manual', label: '手动排序', icon: _jsx(IconChevronsUpDownOutlineRegular, {}) },
        { id: 'updated', label: '按更新时间', icon: _jsx(IconClockOutlineRegular, {}) },
        { type: 'separator', id: 'sep-filter' },
        { type: 'label', id: 'filter-by', text: '归档过滤' },
        { id: 'hide-archived', label: '隐藏已归档', icon: _jsx(IconArchiveOffOutlineRegular, {}) },
        { id: 'show-archived', label: '显示已归档', icon: _jsx(IconQueueOutlineRegular, {}) },
        { id: 'only-archived', label: '只看已归档', icon: _jsx(IconArchiveCheckOutlineRegular, {}) },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: "\u89C6\u56FE\u9009\u9879", side: "bottom", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u89C6\u56FE\u9009\u9879", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        const next = menuPointFromEvent(event);
                        setPoint((current) => (current === null ? next : null));
                    }, children: _jsx(IconSlidersTwoOutlineRegular, {}) }) }), point !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, align: "end", dense: true, listClassName: C.viewOptionsMenu, getAnchorRect: () => menuAnchorRect(point), items: items, selectedIds: [props.groupBy, props.orderBy, archivedFilterToId[props.archivedFilter]], onClose: () => setPoint(null), onSelect: (id) => {
                    setPoint(null);
                    if (id === 'workspace' || id === 'workspace-tree' || id === 'flat')
                        props.onChange({ groupBy: id });
                    else if (id === 'manual' || id === 'updated')
                        props.onChange({ orderBy: id });
                    else if (id === 'hide-archived')
                        props.onChange({ archivedFilter: 'default' });
                    else if (id === 'show-archived')
                        props.onChange({ archivedFilter: 'show' });
                    else if (id === 'only-archived')
                        props.onChange({ archivedFilter: 'only' });
                } })) : null] }));
}
/** 「添加工作区」下拉框：按 WORKSPACE_KINDS 枚举渲染，几类几个选项。 */
function AddWorkspaceMenu(props) {
    const [point, setPoint] = useState(null);
    const items = WORKSPACE_KINDS.map((kind) => ({
        id: kind.id,
        label: kind.label,
        icon: _jsx(WorkspaceKindIcon, { kind: kind.id, size: 14 }),
    }));
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: "\u65B0\u5EFA\u5DE5\u4F5C\u533A", side: "bottom", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: C.iconButton, "aria-label": "\u65B0\u5EFA\u5DE5\u4F5C\u533A", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        const next = menuPointFromEvent(event);
                        setPoint((current) => (current === null ? next : null));
                    }, children: _jsx(IconProjectAddOutlineRegular, { size: 16 }) }) }), point !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => menuAnchorRect(point), items: items, onClose: () => setPoint(null), onSelect: (id) => {
                    setPoint(null);
                    props.onSelectKind(id);
                } })) : null] }));
}
function SessionHoverContent(props) {
    const { node, renderSlot } = props;
    const now = Date.now();
    const statuses = sessionStatuses(node).filter((status) => !(node.archived && (status.state === 'done' || status.state === 'idle')));
    return (_jsxs("div", { className: rowsClass('hoverContent'), children: [_jsx("div", { className: rowsClass('hoverTitle'), children: displayTitle(node) }), !node.blank ? _jsx("div", { className: rowsClass('hoverTime'), children: hoverTimeLabel(node.updatedAt, now) }) : null, typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.hover', { sessionId: node.id }) : null, statuses.map((status) => (_jsxs("div", { className: rowsClass('hoverStatus'), children: [_jsx(StateDot, { state: status.state }), _jsx("span", { children: status.label })] }, status.label))), node.archived ? (_jsxs("div", { className: joinClasses(rowsClass('hoverStatus'), rowsClass('hoverArchived')), children: [_jsx(IconArchiveOutlineRegular, { size: 14 }), _jsx("span", { children: t('row.archived') })] })) : null] }));
}
/** 会话行：slot / title / time / rowActions + HoverCard；「⋯」直接打开宿主的上下文菜单。 */
function SessionRow(props) {
    const { node, current, onOpen, renderSlot, onOpenMenu } = props;
    const statuses = sessionStatuses(node);
    const primaryStatus = statuses[0];
    const showStatus = primaryStatus.state !== 'idle';
    const now = Date.now();
    const row = (_jsxs("div", { role: "treeitem", "data-row-key": `session:${node.id}`, "aria-selected": current, className: joinClasses(rowsClass('sessionRow'), node.archived && rowsClass('archived'), current && rowsClass('selected')), onClick: () => onOpen(node.id), onContextMenu: (event) => {
            event.preventDefault();
            onOpenMenu(node.id, node.title ?? '', event);
        }, children: [_jsx("span", { className: rowsClass('slot'), children: !node.archived && !node.blank && (showStatus
                    ? _jsx(SessionStatusDots, { statuses: statuses })
                    : (typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.leading', { sessionId: node.id }) : null)) }), _jsx("span", { className: rowsClass('title'), children: displayTitle(node) }), !node.blank ? (_jsxs("span", { className: rowsClass('rowResting'), children: [_jsx("span", { className: joinClasses(rowsClass('time'), primaryStatus.trailingLabel === undefined && rowsClass('timestamp')), "aria-hidden": true, children: primaryStatus.trailingLabel ?? timeLabel(node.updatedAt, now) }), typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.trailing', { sessionId: node.id }) : null, node.pinned && !node.archived ? _jsx(PinnedIndicator, {}) : null] })) : null, !node.blank ? (_jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", onClick: (event) => onOpenMenu(node.id, node.title ?? '', event), children: _jsx(IconEllipsisOutlineRegular, {}) }), typeof renderSlot === 'function' ? (_jsx(Entry, { label: "session.row.action", children: renderSlot('sidebar.workspaces.session.row.action', { sessionId: node.id, displayTitle: node.title ?? '' }) })) : null] })) : null] }));
    return (_jsx(HoverCard, { anchor: row, content: _jsx(SessionHoverContent, { node: node, renderSlot: renderSlot }), openDelayMs: 800, grouped: true, copyText: node.blank || node.title === '' ? undefined : node.title, copyLabel: t('copy'), copiedLabel: t('hover.copied') }));
}
export function applyWorkspaceBrowser(ctx) {
    installWorkspaceSlotNoiseFilter();
    // 注意：DSH 新版把 `sidebar.workspaces.session.menu.item` 移到了 `contextMenu.content` 下，
    // 不再属于这个槽；继续声明它会让整份注册失败（占位者消失、回落到宿主原生浏览器）。
    ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
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
    }, (frameworkProps) => (_jsx(Entry, { label: "workspace-browser", fallback: (_jsxs("div", { style: { padding: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }, children: ["\u5DE5\u4F5C\u533A\u6E32\u67D3\u5931\u8D25\uFF0C\u8BE6\u60C5\u89C1\u63A7\u5236\u53F0", _jsx("br", {}), "\uFF08dsh-agent-workflow\uFF09"] })), children: _jsx(WorkspaceBrowser, { ctx: ctx, ...frameworkProps }) }))));
}
function WorkspaceBrowser(props) {
    const { ctx, wide, renderSlot, useWorkspaces, useSessions } = props;
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    /** 搜索框容器与输入框：点击容器展开并聚焦，和宿主一致。 */
    const searchRootRef = useRef(null);
    const searchInputRef = useRef(null);
    const [collapsedWorkspaces, setCollapsedWorkspaces] = useState(() => new Set());
    const [viewOptions, setViewOptions] = useState({
        groupBy: 'workspace',
        orderBy: 'manual',
        archivedFilter: 'default',
    });
    /** 重命名对话框（工作区 / 会话共用）：Electron 不支持 window.prompt，必须自绘。 */
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameDraft, setRenameDraft] = useState('');
    /** 非 usual 工作区（由类型插件注册）的列表，按 kind 分组。 */
    const [pluginItems, setPluginItems] = useState({});
    /** 折叠的非 usual 工作区 id（key = `${kind}:${id}`）。 */
    const [collapsedPlugin, setCollapsedPlugin] = useState(() => new Set());
    /** 拉取所有非 usual 工作区类型插件的列表（启动时 + 新建后复用）。 */
    const loadPluginLists = async () => {
        const next = {};
        for (const kind of nonUsualWorkspaceKinds()) {
            const plugin = getWorkspaceKindPlugin(kind);
            if (plugin === undefined)
                continue;
            try {
                next[kind] = await plugin.list();
            }
            catch (error) {
                console.error(`[dsh-agent-workflow] 读取 ${kind} 工作区列表失败：`, error);
                next[kind] = [];
            }
        }
        setPluginItems(next);
    };
    useEffect(() => {
        void loadPluginLists();
    }, []);
    const workspacesSnapshot = typeof useWorkspaces === 'function' ? useWorkspaces((s) => s) : null;
    const sessionsSnapshot = typeof useSessions === 'function' ? useSessions((s) => s) : null;
    const workspaceItems = workspacesSnapshot?.items ?? [];
    const sessionsById = sessionsSnapshot?.byId ?? {};
    /**
     * 当前打开着的会话：宿主用 `retainedBy.mainView > 0` 标记正在主视图里显示的那一条
     * （见宿主 ui-workspace 的快捷键实现），这里沿用同一判据，保证和原生列表一致。
     */
    const currentSessionId = (() => {
        for (const summary of Object.values(sessionsById)) {
            const retainedByMainView = summary?.retainedBy?.mainView;
            if (typeof retainedByMainView === 'number' && retainedByMainView > 0) {
                return typeof summary.id === 'string' ? summary.id : null;
            }
        }
        return null;
    })();
    /** 按目录路径找宿主的「目录工作区」id（Windows 下大小写与结尾斜杠不敏感）。 */
    const findWorkspaceIdByPath = (path) => {
        if (typeof path !== 'string' || path.trim() === '')
            return null;
        const normalize = (value) => value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
        const target = normalize(path);
        for (const workspace of workspaceItems) {
            const workspacePath = workspace?.path;
            if (typeof workspacePath !== 'string')
                continue;
            if (normalize(workspacePath) !== target)
                continue;
            const workspaceId = workspace?.workspaceId;
            return typeof workspaceId === 'string' ? workspaceId : null;
        }
        return null;
    };
    /** 交给非 usual 类型插件的运行环境（模块间只通过它拿数据和服务）。 */
    const workspaceKindRuntime = {
        ctx,
        currentSessionId,
        findWorkspaceIdByPath,
        requestRenameWorkspace: (workspaceId, currentTitle) => {
            setRenameTarget({ kind: 'workspace', id: workspaceId, title: currentTitle });
            setRenameDraft(currentTitle);
        },
        requestDeleteWorkspace: (workspaceId) => {
            void deleteWorkspaceWithClaims(workspaceId);
        },
        requestRenameSession: (sessionId, currentTitle) => {
            setRenameTarget({ kind: 'session', id: sessionId, title: currentTitle });
            setRenameDraft(currentTitle);
        },
    };
    const uiWorkspace = getService(ctx, 'uiWorkspace');
    const workspacesSvc = getService(ctx, 'workspaces');
    const backfilledWorkflowIds = useRef(new Set());
    /**
     * 一次性迁移：老快照只有 working_directory、没有 host_workspace_id。
     * 这里按路径找到对应的宿主目录工作区，把 id 写回快照，从此认领不再依赖路径比对。
     */
    useEffect(() => {
        const workflows = pluginItems[WorkspaceKind.Workflow] ?? [];
        const pending = workflows.filter((item) => (typeof item.workspaceId !== 'string' || item.workspaceId === '') && item.id !== undefined && !backfilledWorkflowIds.current.has(item.id));
        if (pending.length === 0)
            return undefined;
        let cancelled = false;
        void (async () => {
            for (const item of pending) {
                const path = typeof item.path === 'string' ? item.path : '';
                if (path === '')
                    continue;
                const hostWorkspaceId = findWorkspaceIdByPath(path);
                if (hostWorkspaceId === null)
                    continue;
                backfilledWorkflowIds.current.add(item.id);
                try {
                    const response = await fetch('/dsh-agent-workflow/link-workspace', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ id: item.id, hostWorkspaceId }),
                    });
                    const data = await response.json().catch(() => null);
                    if (data?.ok !== true)
                        console.error('[dsh-agent-workflow] 回写工作区 id 失败：', data);
                }
                catch (error) {
                    console.error('[dsh-agent-workflow] 回写工作区 id 失败：', error);
                }
            }
            if (!cancelled)
                await loadPluginLists();
        })();
        return () => {
            cancelled = true;
        };
    }, [pluginItems, workspaceItems]);
    /**
     * 类型认领表：哪些宿主目录工作区其实是非 usual 类型（当前即 workflow）。
     * 认领后侧栏只渲染类型插件的那一行，不再按 usual 渲染——同一目录不会出现两行。
     */
    const workspaceClaims = (() => {
        const workspaceKey = (workspace) => (typeof workspace?.workspaceId === 'string'
            ? `id:${workspace.workspaceId}`
            : `path:${normalizeWorkspacePath(String(workspace?.path ?? ''))}`);
        const byWorkspace = new Map();
        const claimedItems = new Set();
        for (const kind of nonUsualWorkspaceKinds()) {
            const plugin = getWorkspaceKindPlugin(kind);
            if (plugin === undefined || typeof plugin.matchWorkspace !== 'function')
                continue;
            for (const summary of pluginItems[kind] ?? []) {
                const target = workspaceItems.find((workspace) => plugin.matchWorkspace(summary, {
                    workspaceId: workspace?.workspaceId,
                    path: workspace?.path,
                }));
                if (target === undefined)
                    continue;
                byWorkspace.set(workspaceKey(target), { kind, summary });
                claimedItems.add(`${kind}:${summary.id}`);
            }
        }
        return { byWorkspace, claimedItems, workspaceKey };
    })();
    const openSession = (sessionId) => {
        try {
            if (typeof uiWorkspace?.openSession !== 'function') {
                console.error('[dsh-agent-workflow] uiWorkspace.openSession 不可用');
                return;
            }
            uiWorkspace.openSession(sessionId);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] openSession 失败：', error);
        }
    };
    /** 按类型新建工作区：usual 走宿主；其它类型交给对应插件（解耦点只有枚举 + 注册表）。 */
    const addWorkspace = async (kind) => {
        const picker = getService(ctx, 'uiWorkspace');
        if (typeof picker?.pickDirectory !== 'function')
            return;
        try {
            const path = await picker.pickDirectory();
            if (typeof path !== 'string' || path === '')
                return;
            if (kind === WorkspaceKind.Usual) {
                await workspacesSvc?.create?.({ path });
                return;
            }
            const plugin = getWorkspaceKindPlugin(kind);
            if (plugin === undefined) {
                console.error(`[dsh-agent-workflow] 未注册的工作区类型：${kind}`);
                return;
            }
            // 非 usual 类型的工作区本质上就是一个宿主目录工作区：先把它建出来，
            // 再把 id 交给类型插件，两者从此是同一个东西（侧栏只显示一行）。
            let hostWorkspaceId = findWorkspaceIdByPath(path);
            if (hostWorkspaceId === null && typeof workspacesSvc?.create === 'function') {
                try {
                    const created = await workspacesSvc.create({ path });
                    hostWorkspaceId = typeof created?.workspaceId === 'string' ? created.workspaceId : null;
                }
                catch (error) {
                    console.error('[dsh-agent-workflow] 建立目录工作区失败：', error);
                }
            }
            await plugin.create(path, { workspaceId: hostWorkspaceId });
            await loadPluginLists();
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 新建工作区失败：', error);
        }
    };
    const toggleWorkspace = (workspaceId) => {
        setCollapsedWorkspaces((previous) => {
            const next = new Set(previous);
            if (next.has(workspaceId))
                next.delete(workspaceId);
            else
                next.add(workspaceId);
            return next;
        });
    };
    const startSession = (workspaceId) => {
        try {
            uiWorkspace?.startSession?.(workspaceId);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] startSession 失败：', error);
        }
    };
    const renameWorkspace = async (workspaceId, title) => {
        try {
            await workspacesSvc?.rename?.(workspaceId, title);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 重命名工作区失败：', error);
        }
    };
    const deleteWorkspace = async (workspaceId) => {
        try {
            await workspacesSvc?.delete?.(workspaceId);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 删除工作区失败：', error);
        }
    };
    /**
     * 删除宿主工作区，并顺带清掉认领它的类型数据（否则会留下一条打不开的孤儿行）。
     * 认领关系按 workspaceId 查；查不到就只删宿主工作区。
     */
    const deleteWorkspaceWithClaims = async (workspaceId) => {
        const claim = workspaceClaims.byWorkspace.get(`id:${workspaceId}`);
        await deleteWorkspace(workspaceId);
        if (claim === undefined)
            return;
        try {
            await fetch('/dsh-agent-workflow/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: claim.summary.id }),
            });
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 删除 workflow 数据失败：', error);
        }
        await loadPluginLists();
    };
    /** 重命名会话：照抄宿主 renameSession（sessions.using → binding.session.rename）。 */
    const renameSession = async (sessionId, title) => {
        try {
            const sessionsSvc = getService(ctx, 'sessions');
            if (typeof sessionsSvc?.using !== 'function') {
                console.error('[dsh-agent-workflow] sessions.using 不可用，无法重命名会话');
                return;
            }
            const result = await sessionsSvc.using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title));
            if (result !== undefined && result.ok === false)
                throw new Error(result.error?.message ?? '重命名失败');
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 重命名会话失败：', error);
        }
    };
    /** 点击归档会话 = 取消归档（宿主行为：归档会话不可直接打开）。 */
    const unarchiveSession = async (sessionId) => {
        try {
            await uiWorkspace?.unarchiveSession?.(sessionId);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 取消归档失败：', error);
        }
    };
    /**
     * 打开宿主的会话上下文菜单（照抄宿主 `browserInjected.openSessionMenu`）。
     * 菜单项由宿主自己通过 `ctx.contextMenus.register` 注册，我们只负责把它打开。
     */
    const openSessionMenu = (sessionId, displayTitle, event) => {
        const point = event !== undefined && typeof event.clientX === 'number'
            ? { x: event.clientX, y: event.clientY }
            : undefined;
        openSessionMenuAt(sessionId, displayTitle, point);
    };
    /** 同上，但用显式坐标（类型插件的行没有原始事件）。 */
    const openSessionMenuAt = (sessionId, displayTitle, point) => {
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
            contextMenus.open({ kind: 'session', value: { sessionId, displayTitle } }, point);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 打开会话菜单失败：', error);
        }
    };
    const keyword = query.trim().toLowerCase();
    const renderSessionRow = (session) => (_jsx(SessionRow, { node: session, current: currentSessionId !== null && session.id === currentSessionId, onOpen: session.archived ? unarchiveSession : openSession, renderSlot: renderSlot, onOpenMenu: openSessionMenu }, session.id));
    const archivedSessionIds = new Set(workspacesSnapshot?.archivedSessionIds ?? []);
    // 置顶读宿主的 pinnedSessionIds（宿主自己的置顶星标/菜单项本来就能用）。
    const pinnedSet = new Set(workspacesSnapshot?.pinnedSessionIds ?? []);
    const decorateSession = (summary) => summary === undefined || summary === null
        ? null
        : { ...summary, archived: archivedSessionIds.has(summary.id), pinned: pinnedSet.has(summary.id) };
    const archiveVisible = (s) => {
        if (viewOptions.archivedFilter === 'only')
            return s.archived === true;
        if (viewOptions.archivedFilter === 'show')
            return true;
        return s.archived !== true;
    };
    const buildWorkspaceSessions = (ws) => {
        const list = (ws.sessionIds ?? [])
            .map((id) => decorateSession(sessionsById[id]))
            .filter((s) => s !== null && s.blank !== true && archiveVisible(s))
            .filter((s) => keyword === '' || (s.title ?? '').toLowerCase().includes(keyword));
        // 置顶只作用于本工作区：置顶的排最前，其余保持原顺序（或按更新时间）。
        return [...list].sort((a, b) => {
            const pinnedDelta = Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id));
            if (pinnedDelta !== 0)
                return pinnedDelta;
            if (viewOptions.orderBy === 'updated')
                return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
            return 0;
        });
    };
    const flatSessions = workspaceItems.flatMap((ws) => buildWorkspaceSessions(ws));
    return (_jsxs("div", { className: joinClasses(C.root, wide ? C.wide : C.rail), style: { position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }, children: [_jsxs("div", { className: joinClasses(C.sectionHeader, wide ? C.searchSpacingMotion : undefined), 
                // 展开时宿主会把 padding-inline 换一套值，导致图标整体位移；这里锁住左边距。
                style: { paddingLeft: 'var(--dsh-sidebar-row-padding)' }, children: [wide ? (_jsx("span", { className: joinClasses(C.sectionLabel, C.wide, searchOpen ? C.sectionLabelHidden : undefined), children: "\u5DE5\u4F5C\u533A" })) : null, wide ? (_jsx("div", { className: joinClasses(C.searchSlot, searchOpen ? C.searchSlotExpanded : undefined), children: _jsxs("div", { ref: searchRootRef, className: joinClasses(C.search, searchOpen ? C.searchExpanded : undefined), onClick: () => {
                                setSearchOpen(true);
                                searchInputRef.current?.focus();
                            }, children: [_jsx(Tooltip, { label: "\u641C\u7D22", side: "bottom", delayMs: 500, disabled: searchOpen, portal: true, children: _jsx("button", { type: "button", className: C.searchButton, "aria-label": "\u641C\u7D22\u4F1A\u8BDD", "aria-expanded": searchOpen, onClick: () => {
                                            if (searchOpen) {
                                                setQuery('');
                                                setSearchOpen(false);
                                            }
                                            else {
                                                setSearchOpen(true);
                                                searchInputRef.current?.focus();
                                            }
                                        }, children: _jsx(IconSearchOutlineRegular, { size: searchOpen ? 11 : 14 }) }) }), _jsx("input", { ref: searchInputRef, className: C.searchInput, type: "text", placeholder: "\u641C\u7D22\u4F1A\u8BDD\u540D\u79F0", tabIndex: searchOpen ? 0 : -1, value: query, onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
                                        if (event.key !== 'Escape')
                                            return;
                                        setQuery('');
                                        setSearchOpen(false);
                                    } }), searchOpen ? (_jsx("button", { type: "button", className: C.clearButton, "aria-label": "\u6E05\u9664\u641C\u7D22", onClick: (event) => {
                                        event.stopPropagation();
                                        setQuery('');
                                        setSearchOpen(false);
                                    }, children: _jsx(IconCloseFillRegular, {}) })) : null] }) })) : null, _jsxs("div", { className: joinClasses(C.headerActions, wide && searchOpen ? C.headerActionsHidden : undefined), 
                        // 绝对定位写死每个按钮的右偏移：图标大小/包裹元素变化都不会挤动邻居。
                        // 视图选项比新建工作区多左移一倍（+4px 间距 + 额外 4px）。
                        style: wide && searchOpen
                            ? { maxWidth: 0, opacity: 0, pointerEvents: 'none' }
                            : { position: 'relative', flex: 'none', width: 64, height: 28 }, children: [_jsx("div", { style: { position: 'absolute', top: 0, right: 36, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx(ViewOptionsMenu, { groupBy: viewOptions.groupBy, orderBy: viewOptions.orderBy, archivedFilter: viewOptions.archivedFilter, onChange: (patch) => setViewOptions((previous) => ({ ...previous, ...patch })) }) }), _jsx("div", { style: { position: 'absolute', top: 0, right: 2, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx(AddWorkspaceMenu, { onSelectKind: (kind) => void addWorkspace(kind) }) })] })] }), _jsx("div", { className: C.listArea, style: { flex: 1, overflow: 'auto', minHeight: 0 }, children: flatSessions.length === 0 && Object.values(pluginItems).every((items) => items.length === 0) ? (_jsx("div", { className: C.emptyState, children: _jsx("div", { className: C.empty, children: keyword === '' ? '还没有工作区' : '没有匹配的会话' }) })) : (_jsx("div", { className: C.list, children: viewOptions.groupBy === 'flat' ? (flatSessions.map(renderSessionRow)) : (_jsxs(_Fragment, { children: [workspaceItems.map((ws) => {
                                const wsId = ws.workspaceId ?? ws.path;
                                const claim = workspaceClaims.byWorkspace.get(workspaceClaims.workspaceKey(ws));
                                if (claim !== undefined) {
                                    // 这个目录工作区其实是非 usual 类型：交给类型插件渲染成它自己的那一行。
                                    const plugin = getWorkspaceKindPlugin(claim.kind);
                                    if (plugin !== undefined) {
                                        const key = `${claim.kind}:${claim.summary.id}`;
                                        // 标题跟随宿主工作区（重命名走宿主，行文案不用二次同步）。
                                        const summary = typeof ws.title === 'string' && ws.title !== ''
                                            ? { ...claim.summary, title: ws.title, workspaceId: ws.workspaceId ?? claim.summary.workspaceId }
                                            : claim.summary;
                                        return (_jsx("div", { children: plugin.renderItem(summary, collapsedPlugin.has(key), () => {
                                                setCollapsedPlugin((previous) => {
                                                    const next = new Set(previous);
                                                    if (next.has(key))
                                                        next.delete(key);
                                                    else
                                                        next.add(key);
                                                    return next;
                                                });
                                            }, () => void loadPluginLists(), workspaceKindRuntime) }, wsId));
                                    }
                                }
                                const isCollapsed = collapsedWorkspaces.has(wsId);
                                const wsSessions = buildWorkspaceSessions(ws);
                                return (_jsxs("div", { className: rowsClass('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [_jsx(WorkspaceNodeItem, { ws: ws, expanded: !isCollapsed, label: ws.title, onToggle: () => toggleWorkspace(wsId), onNewSession: () => startSession(wsId), onRenameRequest: () => {
                                                setRenameTarget({ kind: 'workspace', id: wsId, title: ws.title ?? '' });
                                                setRenameDraft(ws.title ?? '');
                                            }, onDelete: () => void deleteWorkspace(wsId) }), isCollapsed ? null : wsSessions.map(renderSessionRow)] }, wsId));
                            }), nonUsualWorkspaceKinds().flatMap((kind) => {
                                const plugin = getWorkspaceKindPlugin(kind);
                                if (plugin === undefined)
                                    return [];
                                // 置顶的排前面（只影响同一类型内部的顺序）；已被认领的不再重复渲染。
                                const items = [...(pluginItems[kind] ?? [])]
                                    .filter((summary) => !workspaceClaims.claimedItems.has(`${kind}:${summary.id}`))
                                    .sort((left, right) => Number(right.pinned === true) - Number(left.pinned === true));
                                return items.map((summary) => {
                                    const key = `${kind}:${summary.id}`;
                                    const isCollapsed = collapsedPlugin.has(key);
                                    return (_jsx("div", { children: plugin.renderItem(summary, isCollapsed, () => {
                                            setCollapsedPlugin((previous) => {
                                                const next = new Set(previous);
                                                if (next.has(key))
                                                    next.delete(key);
                                                else
                                                    next.add(key);
                                                return next;
                                            });
                                        }, () => void loadPluginLists(), workspaceKindRuntime) }, key));
                                });
                            })] })) })) }), renameTarget !== null ? (_jsx("div", { style: { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }, onClick: () => setRenameTarget(null), children: _jsxs("div", { style: {
                        minWidth: 320,
                        padding: 16,
                        borderRadius: 10,
                        background: 'var(--dsw-alias-bg-overlay)',
                        border: '1px solid var(--dsw-alias-border-l1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        color: 'var(--dsw-alias-label-primary)',
                    }, onClick: (event) => event.stopPropagation(), children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600 }, children: renameTarget.kind === 'workspace' ? '重命名工作区' : '重命名会话' }), _jsx("input", { autoFocus: true, value: renameDraft, onChange: (event) => setRenameDraft(event.target.value), onKeyDown: (event) => {
                                if (event.key === 'Enter') {
                                    const value = renameDraft.trim();
                                    if (value !== '') {
                                        if (renameTarget.kind === 'workspace')
                                            void renameWorkspace(renameTarget.id, value);
                                        else
                                            void renameSession(renameTarget.id, value);
                                    }
                                    setRenameTarget(null);
                                }
                                else if (event.key === 'Escape') {
                                    setRenameTarget(null);
                                }
                            }, style: {
                                boxSizing: 'border-box',
                                height: 30,
                                padding: '0 8px',
                                borderRadius: 6,
                                border: '1px solid var(--dsw-alias-border-l1)',
                                background: 'var(--dsw-alias-bg-base)',
                                color: 'var(--dsw-alias-label-primary)',
                                font: 'inherit',
                                fontSize: 13,
                            } }), _jsxs("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 }, children: [_jsx("button", { type: "button", onClick: () => setRenameTarget(null), style: {
                                        height: 28,
                                        padding: '0 12px',
                                        borderRadius: 6,
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        background: 'transparent',
                                        color: 'var(--dsw-alias-label-primary)',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", onClick: () => {
                                        const value = renameDraft.trim();
                                        if (value !== '') {
                                            if (renameTarget.kind === 'workspace')
                                                void renameWorkspace(renameTarget.id, value);
                                            else
                                                void renameSession(renameTarget.id, value);
                                        }
                                        setRenameTarget(null);
                                    }, style: {
                                        height: 28,
                                        padding: '0 12px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: 'var(--dsw-alias-brand-primary)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }, children: "\u786E\u5B9A" })] })] }) })) : null] }));
}
//# sourceMappingURL=workspace-browser.js.map