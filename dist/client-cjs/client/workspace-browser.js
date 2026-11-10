"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyWorkspaceBrowser = applyWorkspaceBrowser;
const jsx_runtime_1 = require("react/jsx-runtime");
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
const react_1 = require("react");
const workspace_kind_1 = require("./workspace-kind");
const workspace_ui_1 = require("./workspace-ui");
const workspace_kind_registry_1 = require("./workspace-kind-registry");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
/** 错误边界：槽位条目渲染失败只让那一块消失，不能让整个浏览器炸掉。 */
class EntryBoundary extends react_1.Component {
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
    return ((0, jsx_runtime_1.jsx)(EntryBoundary, { label: props.label, fallback: props.fallback, children: props.children }));
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
    const { unit, n } = (0, dsh_client_ui_primitives_1.relativeTime)(updatedAt, now);
    return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n });
}
function hoverTimeLabel(updatedAt, now) {
    if (!updatedAt)
        return '';
    const { unit, n } = (0, dsh_client_ui_primitives_1.relativeTime)(updatedAt, now);
    return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) });
}
function SessionStatusDots(props) {
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.StateDot, { state: props.statuses[0].state }), props.statuses.map((status) => ((0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('visuallyHidden'), children: status.label }, status.label)))] }));
}
function PinnedIndicator() {
    return ((0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('pinIndicator'), role: "img", "aria-label": "\u7F6E\u9876", title: "\u7F6E\u9876", children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPinFillRegular, { size: 14 }) }));
}
function WorkspaceHoverContent(props) {
    const { ws } = props;
    return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('hoverContent'), children: [(0, jsx_runtime_1.jsx)("div", { className: (0, workspace_ui_1.rowsClass)('hoverTitle'), children: ws.title || '未命名工作区' }), ws.path ? (0, jsx_runtime_1.jsx)("div", { className: (0, workspace_ui_1.rowsClass)('hoverTime'), children: ws.path }) : null] }));
}
/** 照抄宿主 ProjectRowItem：folder + chevron + projectText + Menu（rename/delete）+ 新建会话。 */
function WorkspaceNodeItem(props) {
    const { ws, expanded, label, onToggle, onNewSession, onRenameRequest, onDelete } = props;
    const [menuOpen, setMenuOpen] = (0, react_1.useState)(false);
    const items = [
        { id: 'rename', label: '重命名', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEditOutlineRegular, {}) },
        { id: 'delete', label: '删除工作区', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTrashOutlineRegular, {}), danger: true },
    ];
    const row = ((0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `workspace:${ws.workspaceId ?? ws.path}`, "aria-expanded": expanded, className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('projectRow'), menuOpen && (0, workspace_ui_1.rowsClass)('menuOpen')), onClick: onToggle, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('folder')), style: { color: '#4d7bfd' }, children: expanded ? (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderOpenRegular, { color: "#4d7bfd" }) : (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderCloseRegular, { color: "#4d7bfd" }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('chevron')), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTriangleRightFillRegular, { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('arrow'), expanded && (0, workspace_ui_1.rowsClass)('arrowOpen')) }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('projectText'), children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: label }) }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: menuOpen, onClose: () => setMenuOpen(false), items: items, onSelect: (id) => {
                            setMenuOpen(false);
                            if (id === 'rename')
                                onRenameRequest();
                            else
                                onDelete();
                        }, portal: true, closeOnPointerLeave: true, anchor: ((0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", onClick: () => setMenuOpen((value) => !value), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) })) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD", onClick: onNewSession, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconNewChatOutlineRegular, {}) }) })] })] }));
    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.HoverCard, { anchor: row, content: (0, jsx_runtime_1.jsx)(WorkspaceHoverContent, { ws: ws }), openDelayMs: 800, grouped: true, copyText: ws.path, copyLabel: t('copy'), copiedLabel: t('hover.copied') }));
}
/** 视图选项：分组 / 排序 / 归档过滤。 */
function ViewOptionsMenu(props) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const archivedFilterToId = {
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
    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: open, onClose: () => setOpen(false), items: items, selectedIds: [props.groupBy, props.orderBy, archivedFilterToId[props.archivedFilter]], onSelect: (id) => {
            setOpen(false);
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
        }, align: "end", dense: true, portal: true, anchor: ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u89C6\u56FE\u9009\u9879", side: "bottom", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u89C6\u56FE\u9009\u9879", onClick: () => setOpen((value) => !value), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconSlidersTwoOutlineRegular, {}) }) })) }));
}
/** 「添加工作区」下拉框：按 WORKSPACE_KINDS 枚举渲染，几类几个选项。 */
function AddWorkspaceMenu(props) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const items = workspace_kind_1.WORKSPACE_KINDS.map((kind) => ({
        id: kind.id,
        label: kind.label,
        icon: (0, jsx_runtime_1.jsx)(workspace_ui_1.WorkspaceKindIcon, { kind: kind.id, size: 14 }),
    }));
    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: open, onClose: () => setOpen(false), items: items, onSelect: (id) => {
            setOpen(false);
            props.onSelectKind(id);
        }, align: "end", portal: true, anchor: ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5DE5\u4F5C\u533A", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: C.iconButton, "aria-label": "\u6DFB\u52A0\u5DE5\u4F5C\u533A", onClick: () => setOpen((value) => !value), children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h8A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z" }), (0, jsx_runtime_1.jsx)("path", { d: "M11.5 11v4M9.5 13h4" })] }) }) })) }));
}
function SessionHoverContent(props) {
    const { node, renderSlot } = props;
    const now = Date.now();
    const statuses = sessionStatuses(node).filter((status) => !(node.archived && (status.state === 'done' || status.state === 'idle')));
    return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('hoverContent'), children: [(0, jsx_runtime_1.jsx)("div", { className: (0, workspace_ui_1.rowsClass)('hoverTitle'), children: displayTitle(node) }), !node.blank ? (0, jsx_runtime_1.jsx)("div", { className: (0, workspace_ui_1.rowsClass)('hoverTime'), children: hoverTimeLabel(node.updatedAt, now) }) : null, typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.hover', { sessionId: node.id }) : null, statuses.map((status) => ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('hoverStatus'), children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.StateDot, { state: status.state }), (0, jsx_runtime_1.jsx)("span", { children: status.label })] }, status.label))), node.archived ? ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('hoverStatus'), (0, workspace_ui_1.rowsClass)('hoverArchived')), children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconArchiveOutlineRegular, { size: 14 }), (0, jsx_runtime_1.jsx)("span", { children: t('row.archived') })] })) : null] }));
}
/** 会话行：slot / title / time / rowActions + HoverCard；「⋯」直接打开宿主的上下文菜单。 */
function SessionRow(props) {
    const { node, current, onOpen, renderSlot, onOpenMenu } = props;
    const statuses = sessionStatuses(node);
    const primaryStatus = statuses[0];
    const showStatus = primaryStatus.state !== 'idle';
    const now = Date.now();
    const row = ((0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `session:${node.id}`, "aria-selected": current, className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('sessionRow'), node.archived && (0, workspace_ui_1.rowsClass)('archived'), current && (0, workspace_ui_1.rowsClass)('selected')), onClick: () => onOpen(node.id), onContextMenu: (event) => {
            event.preventDefault();
            onOpenMenu(node.id, node.title ?? '', event);
        }, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('slot'), children: !node.archived && !node.blank && (showStatus
                    ? (0, jsx_runtime_1.jsx)(SessionStatusDots, { statuses: statuses })
                    : (typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.leading', { sessionId: node.id }) : null)) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: displayTitle(node) }), !node.blank ? ((0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('time'), "aria-hidden": true, children: primaryStatus.trailingLabel ?? timeLabel(node.updatedAt, now) })) : null, node.pinned && !node.archived ? (0, jsx_runtime_1.jsx)(PinnedIndicator, {}) : null, !node.blank ? ((0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", onClick: (event) => onOpenMenu(node.id, node.title ?? '', event), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), typeof renderSlot === 'function' ? ((0, jsx_runtime_1.jsx)(Entry, { label: "session.row.action", children: renderSlot('sidebar.workspaces.session.row.action', { sessionId: node.id, displayTitle: node.title ?? '' }) })) : null] })) : null] }));
    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.HoverCard, { anchor: row, content: (0, jsx_runtime_1.jsx)(SessionHoverContent, { node: node, renderSlot: renderSlot }), openDelayMs: 800, grouped: true, copyText: node.blank || node.title === '' ? undefined : node.title, copyLabel: t('copy'), copiedLabel: t('hover.copied') }));
}
function applyWorkspaceBrowser(ctx) {
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
    }, (frameworkProps) => ((0, jsx_runtime_1.jsx)(Entry, { label: "workspace-browser", fallback: ((0, jsx_runtime_1.jsxs)("div", { style: { padding: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }, children: ["\u5DE5\u4F5C\u533A\u6E32\u67D3\u5931\u8D25\uFF0C\u8BE6\u60C5\u89C1\u63A7\u5236\u53F0", (0, jsx_runtime_1.jsx)("br", {}), "\uFF08dsh-agent-workflow\uFF09"] })), children: (0, jsx_runtime_1.jsx)(WorkspaceBrowser, { ctx: ctx, ...frameworkProps }) }))));
}
function WorkspaceBrowser(props) {
    const { ctx, wide, renderSlot, useWorkspaces, useSessions } = props;
    const [searchOpen, setSearchOpen] = (0, react_1.useState)(false);
    const [query, setQuery] = (0, react_1.useState)('');
    const [collapsedWorkspaces, setCollapsedWorkspaces] = (0, react_1.useState)(() => new Set());
    const [viewOptions, setViewOptions] = (0, react_1.useState)({
        groupBy: 'workspace',
        orderBy: 'manual',
        archivedFilter: 'default',
    });
    /** 重命名对话框（工作区 / 会话共用）：Electron 不支持 window.prompt，必须自绘。 */
    const [renameTarget, setRenameTarget] = (0, react_1.useState)(null);
    const [renameDraft, setRenameDraft] = (0, react_1.useState)('');
    /** 非 usual 工作区（由类型插件注册）的列表，按 kind 分组。 */
    const [pluginItems, setPluginItems] = (0, react_1.useState)({});
    /** 折叠的非 usual 工作区 id（key = `${kind}:${id}`）。 */
    const [collapsedPlugin, setCollapsedPlugin] = (0, react_1.useState)(() => new Set());
    /** 拉取所有非 usual 工作区类型插件的列表（启动时 + 新建后复用）。 */
    const loadPluginLists = async () => {
        const next = {};
        for (const kind of (0, workspace_kind_registry_1.nonUsualWorkspaceKinds)()) {
            const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
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
    (0, react_1.useEffect)(() => {
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
    const workspaceKindRuntime = { ctx, currentSessionId, findWorkspaceIdByPath };
    const uiWorkspace = getService(ctx, 'uiWorkspace');
    const workspacesSvc = getService(ctx, 'workspaces');
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
            if (kind === workspace_kind_1.WorkspaceKind.Usual) {
                await workspacesSvc?.create?.({ path });
                return;
            }
            const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
            if (plugin === undefined) {
                console.error(`[dsh-agent-workflow] 未注册的工作区类型：${kind}`);
                return;
            }
            await plugin.create(path);
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
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 打开会话菜单失败：', error);
        }
    };
    const keyword = query.trim().toLowerCase();
    const renderSessionRow = (session) => ((0, jsx_runtime_1.jsx)(SessionRow, { node: session, current: currentSessionId !== null && session.id === currentSessionId, onOpen: session.archived ? unarchiveSession : openSession, renderSlot: renderSlot, onOpenMenu: openSessionMenu }, session.id));
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
    return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.joinClasses)(C.root, wide ? C.wide : C.rail), style: { position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 8px',
                    minHeight: 34,
                    boxSizing: 'border-box',
                }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: "\u5DE5\u4F5C\u533A" }), (0, jsx_runtime_1.jsxs)("div", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: searchOpen ? '关闭搜索' : '搜索', side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: C.iconButton, "aria-label": searchOpen ? '关闭搜索' : '搜索', onClick: () => {
                                        if (searchOpen) {
                                            setQuery('');
                                            setSearchOpen(false);
                                        }
                                        else {
                                            setSearchOpen(true);
                                        }
                                    }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "11", cy: "11", r: "6.5" }), (0, jsx_runtime_1.jsx)("path", { d: "m16 16 4.5 4.5" })] }) }) }), (0, jsx_runtime_1.jsx)(ViewOptionsMenu, { groupBy: viewOptions.groupBy, orderBy: viewOptions.orderBy, archivedFilter: viewOptions.archivedFilter, onChange: (patch) => setViewOptions((previous) => ({ ...previous, ...patch })) }), (0, jsx_runtime_1.jsx)(AddWorkspaceMenu, { onSelectKind: (kind) => void addWorkspace(kind) })] })] }), searchOpen ? ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                }, children: [(0, jsx_runtime_1.jsxs)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "var(--dsw-alias-label-secondary)", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { flex: 'none' }, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "11", cy: "11", r: "6.5" }), (0, jsx_runtime_1.jsx)("path", { d: "m16 16 4.5 4.5" })] }), (0, jsx_runtime_1.jsx)("input", { autoFocus: true, value: query, placeholder: "\u641C\u7D22\u4F1A\u8BDD\u540D\u79F0", onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
                            if (event.key === 'Escape') {
                                setQuery('');
                                setSearchOpen(false);
                            }
                        }, style: {
                            flex: 1,
                            minWidth: 0,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: 'var(--dsw-alias-label-primary)',
                            font: 'inherit',
                            fontSize: 13,
                        } }), query !== '' ? ((0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u6E05\u9664\u641C\u7D22", onClick: () => setQuery(''), style: { flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0, border: 'none', borderRadius: 4, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }, children: (0, jsx_runtime_1.jsx)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, children: (0, jsx_runtime_1.jsx)("path", { d: "M6 6l12 12M18 6L6 18" }) }) })) : null] })) : null, (0, jsx_runtime_1.jsx)("div", { className: C.listArea, style: { flex: 1, overflow: 'auto', minHeight: 0 }, children: flatSessions.length === 0 && Object.values(pluginItems).every((items) => items.length === 0) ? ((0, jsx_runtime_1.jsx)("div", { className: C.emptyState, children: (0, jsx_runtime_1.jsx)("div", { className: C.empty, children: keyword === '' ? '还没有工作区' : '没有匹配的会话' }) })) : ((0, jsx_runtime_1.jsx)("div", { className: C.list, children: viewOptions.groupBy === 'flat' ? (flatSessions.map(renderSessionRow)) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [workspaceItems.map((ws) => {
                                const wsId = ws.workspaceId ?? ws.path;
                                const isCollapsed = collapsedWorkspaces.has(wsId);
                                const wsSessions = buildWorkspaceSessions(ws);
                                return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [(0, jsx_runtime_1.jsx)(WorkspaceNodeItem, { ws: ws, expanded: !isCollapsed, label: ws.title, onToggle: () => toggleWorkspace(wsId), onNewSession: () => startSession(wsId), onRenameRequest: () => {
                                                setRenameTarget({ kind: 'workspace', id: wsId, title: ws.title ?? '' });
                                                setRenameDraft(ws.title ?? '');
                                            }, onDelete: () => void deleteWorkspace(wsId) }), isCollapsed ? null : wsSessions.map(renderSessionRow)] }, wsId));
                            }), (0, workspace_kind_registry_1.nonUsualWorkspaceKinds)().flatMap((kind) => {
                                const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
                                if (plugin === undefined)
                                    return [];
                                // 置顶的排前面（只影响同一类型内部的顺序）。
                                const items = [...(pluginItems[kind] ?? [])].sort((left, right) => Number(right.pinned === true) - Number(left.pinned === true));
                                return items.map((summary) => {
                                    const key = `${kind}:${summary.id}`;
                                    const isCollapsed = collapsedPlugin.has(key);
                                    return ((0, jsx_runtime_1.jsx)("div", { children: plugin.renderItem(summary, isCollapsed, () => {
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
                            })] })) })) }), renameTarget !== null ? ((0, jsx_runtime_1.jsx)("div", { style: { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }, onClick: () => setRenameTarget(null), children: (0, jsx_runtime_1.jsxs)("div", { style: {
                        minWidth: 320,
                        padding: 16,
                        borderRadius: 10,
                        background: 'var(--dsw-alias-bg-overlay)',
                        border: '1px solid var(--dsw-alias-border-l1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        color: 'var(--dsw-alias-label-primary)',
                    }, onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, fontWeight: 600 }, children: renameTarget.kind === 'workspace' ? '重命名工作区' : '重命名会话' }), (0, jsx_runtime_1.jsx)("input", { autoFocus: true, value: renameDraft, onChange: (event) => setRenameDraft(event.target.value), onKeyDown: (event) => {
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
                            } }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 }, children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setRenameTarget(null), style: {
                                        height: 28,
                                        padding: '0 12px',
                                        borderRadius: 6,
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        background: 'transparent',
                                        color: 'var(--dsw-alias-label-primary)',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }, children: "\u53D6\u6D88" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
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