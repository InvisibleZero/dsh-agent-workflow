window.__ModuleLoader__.load({
  id: "dsh-agent-workflow",
  factory: (require) => {
    var __mods = {
    "client/dsh-plugin.js": function(__req, module, exports) {
    "use strict";
    // @ts-nocheck
    /**
     * dsh 客户端插件入口（浏览器半）。
     *
     * 只做一件事：注册伪装层 `sidebar.workspaces`（替换宿主的目录工作区浏览器）。
     * workflow 工作区不是独立入口，而是「添加工作区」下拉框里的一个类型，
     * 在侧栏工作区区域内原地渲染（每种类型一个可嵌入渲染器）。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.inject = exports.name = void 0;
    exports.apply = apply;
    const workspace_browser_1 = __req("client/workspace-browser.js");
    const workflow_embedded_1 = __req("client/workflow-embedded.js");
    const workspace_kind_registry_1 = __req("client/workspace-kind-registry.js");
    exports.name = 'dsh-agent-workflow-client';
    // `remote` + `remote.workspace`：置顶桥要直连 workspaceController 的 Remote 端点。
    //   注意：只注入 remote 不够，访问子属性还要显式声明 "remote.workspace"，
    //   否则抛 'cannot get property "remote.workspace" without inject'。
    // `shortcuts`：宿主的会话菜单项（重命名/分叉/归档）要用 ctx.shortcuts.catalog 作为 hooks.shortcuts，
    //   缺了会抛 "useShortcuts is not a function"。
    exports.inject = ['slots', 'remote', 'remote.workspace', 'shortcuts'];
    function apply(ctx) {
        // 装配点：把 workflow 类型挂进工作区类型注册表（唯一的跨模块耦合点，另两处是枚举与注册表本身）。
        (0, workspace_kind_registry_1.registerWorkspaceKindPlugin)(workflow_embedded_1.workflowKindPlugin);
        try {
            (0, workspace_browser_1.applyWorkspaceBrowser)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 伪装层注册失败：', error);
        }
    }
    //# sourceMappingURL=dsh-plugin.js.map
    },
    "client/workspace-browser.js": function(__req, module, exports) {
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
    const workspace_kind_1 = __req("client/workspace-kind.js");
    const workspace_ui_1 = __req("client/workspace-ui.js");
    const workspace_kind_registry_1 = __req("client/workspace-kind-registry.js");
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
        const [menuPoint, setMenuPoint] = (0, react_1.useState)(null);
        const items = [
            { id: 'rename', label: '重命名', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEditOutlineRegular, {}) },
            { id: 'delete', label: '删除工作区', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTrashOutlineRegular, {}), danger: true },
        ];
        const row = ((0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `workspace:${ws.workspaceId ?? ws.path}`, "aria-expanded": expanded, className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('projectRow'), menuPoint !== null && (0, workspace_ui_1.rowsClass)('menuOpen')), onClick: onToggle, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('folder')), style: { color: '#4d7bfd' }, children: expanded ? (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderOpenRegular, { color: "#4d7bfd" }) : (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderCloseRegular, { color: "#4d7bfd" }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('chevron')), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTriangleRightFillRegular, { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('arrow'), expanded && (0, workspace_ui_1.rowsClass)('arrowOpen')) }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('projectText'), children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: label }) }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": menuPoint !== null, onClick: (event) => {
                                const point = (0, workspace_ui_1.menuPointFromEvent)(event);
                                setMenuPoint((current) => (current === null ? point : null));
                            }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), menuPoint !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(menuPoint), items: items, onClose: () => setMenuPoint(null), onSelect: (id) => {
                                setMenuPoint(null);
                                if (id === 'rename')
                                    onRenameRequest();
                                else
                                    onDelete();
                            } })) : null, (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD", onClick: onNewSession, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconNewChatOutlineRegular, {}) }) })] })] }));
        return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.HoverCard, { anchor: row, content: (0, jsx_runtime_1.jsx)(WorkspaceHoverContent, { ws: ws }), openDelayMs: 800, grouped: true, copyText: ws.path, copyLabel: t('copy'), copiedLabel: t('hover.copied') }));
    }
    /** 视图选项：分组 / 排序 / 归档过滤。 */
    function ViewOptionsMenu(props) {
        const [point, setPoint] = (0, react_1.useState)(null);
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
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u89C6\u56FE\u9009\u9879", side: "bottom", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u89C6\u56FE\u9009\u9879", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                            const next = (0, workspace_ui_1.menuPointFromEvent)(event);
                            setPoint((current) => (current === null ? next : null));
                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconSlidersTwoOutlineRegular, {}) }) }), point !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", dense: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(point), items: items, selectedIds: [props.groupBy, props.orderBy, archivedFilterToId[props.archivedFilter]], onClose: () => setPoint(null), onSelect: (id) => {
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
        const [point, setPoint] = (0, react_1.useState)(null);
        const items = workspace_kind_1.WORKSPACE_KINDS.map((kind) => ({
            id: kind.id,
            label: kind.label,
            icon: (0, jsx_runtime_1.jsx)(workspace_ui_1.WorkspaceKindIcon, { kind: kind.id, size: 14 }),
        }));
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5DE5\u4F5C\u533A", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: C.iconButton, "aria-label": "\u6DFB\u52A0\u5DE5\u4F5C\u533A", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                            const next = (0, workspace_ui_1.menuPointFromEvent)(event);
                            setPoint((current) => (current === null ? next : null));
                        }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h8A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z" }), (0, jsx_runtime_1.jsx)("path", { d: "M11.5 11v4M9.5 13h4" })] }) }) }), point !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(point), items: items, onClose: () => setPoint(null), onSelect: (id) => {
                        setPoint(null);
                        props.onSelectKind(id);
                    } })) : null] }));
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
                        : (typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.leading', { sessionId: node.id }) : null)) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: displayTitle(node) }), !node.blank ? ((0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowResting'), children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('time'), primaryStatus.trailingLabel === undefined && (0, workspace_ui_1.rowsClass)('timestamp')), "aria-hidden": true, children: primaryStatus.trailingLabel ?? timeLabel(node.updatedAt, now) }), typeof renderSlot === 'function' ? renderSlot('sidebar.session.row.trailing', { sessionId: node.id }) : null, node.pinned && !node.archived ? (0, jsx_runtime_1.jsx)(PinnedIndicator, {}) : null] })) : null, !node.blank ? ((0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", onClick: (event) => onOpenMenu(node.id, node.title ?? '', event), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), typeof renderSlot === 'function' ? ((0, jsx_runtime_1.jsx)(Entry, { label: "session.row.action", children: renderSlot('sidebar.workspaces.session.row.action', { sessionId: node.id, displayTitle: node.title ?? '' }) })) : null] })) : null] }));
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
            requestSessionMenu: (sessionId, displayTitle, point) => {
                openSessionMenuAt(sessionId, displayTitle, point);
            },
        };
        const uiWorkspace = getService(ctx, 'uiWorkspace');
        const workspacesSvc = getService(ctx, 'workspaces');
        const backfilledWorkflowIds = (0, react_1.useRef)(new Set());
        /**
         * 一次性迁移：老快照只有 working_directory、没有 host_workspace_id。
         * 这里按路径找到对应的宿主目录工作区，把 id 写回快照，从此认领不再依赖路径比对。
         */
        (0, react_1.useEffect)(() => {
            const workflows = pluginItems[workspace_kind_1.WorkspaceKind.Workflow] ?? [];
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
                : `path:${(0, workspace_kind_registry_1.normalizeWorkspacePath)(String(workspace?.path ?? ''))}`);
            const byWorkspace = new Map();
            const claimedItems = new Set();
            for (const kind of (0, workspace_kind_registry_1.nonUsualWorkspaceKinds)()) {
                const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
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
                if (kind === workspace_kind_1.WorkspaceKind.Usual) {
                    await workspacesSvc?.create?.({ path });
                    return;
                }
                const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
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
                                    const claim = workspaceClaims.byWorkspace.get(workspaceClaims.workspaceKey(ws));
                                    if (claim !== undefined) {
                                        // 这个目录工作区其实是非 usual 类型：交给类型插件渲染成它自己的那一行。
                                        const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(claim.kind);
                                        if (plugin !== undefined) {
                                            const key = `${claim.kind}:${claim.summary.id}`;
                                            // 标题跟随宿主工作区（重命名走宿主，行文案不用二次同步）。
                                            const summary = typeof ws.title === 'string' && ws.title !== ''
                                                ? { ...claim.summary, title: ws.title, workspaceId: ws.workspaceId ?? claim.summary.workspaceId }
                                                : claim.summary;
                                            return ((0, jsx_runtime_1.jsx)("div", { children: plugin.renderItem(summary, collapsedPlugin.has(key), () => {
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
                                    return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [(0, jsx_runtime_1.jsx)(WorkspaceNodeItem, { ws: ws, expanded: !isCollapsed, label: ws.title, onToggle: () => toggleWorkspace(wsId), onNewSession: () => startSession(wsId), onRenameRequest: () => {
                                                    setRenameTarget({ kind: 'workspace', id: wsId, title: ws.title ?? '' });
                                                    setRenameDraft(ws.title ?? '');
                                                }, onDelete: () => void deleteWorkspace(wsId) }), isCollapsed ? null : wsSessions.map(renderSessionRow)] }, wsId));
                                }), (0, workspace_kind_registry_1.nonUsualWorkspaceKinds)().flatMap((kind) => {
                                    const plugin = (0, workspace_kind_registry_1.getWorkspaceKindPlugin)(kind);
                                    if (plugin === undefined)
                                        return [];
                                    // 置顶的排前面（只影响同一类型内部的顺序）；已被认领的不再重复渲染。
                                    const items = [...(pluginItems[kind] ?? [])]
                                        .filter((summary) => !workspaceClaims.claimedItems.has(`${kind}:${summary.id}`))
                                        .sort((left, right) => Number(right.pinned === true) - Number(left.pinned === true));
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
    },
    "client/workspace-kind.js": function(__req, module, exports) {
    "use strict";
    /**
     * 工作区类型：区分宿主的老工作区（usual）与 workflow 工作区（workflow）。
     *
     * 类型**不再拼标题后缀**（`（usual）`/`（workflow）` 会让标题变吵），
     * 改由左侧图标区分：usual = 文件夹，workflow = 树结构。
     * 这里只放数据与文案，图标由客户端组件按 `iconKey` 渲染。
     */
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WORKSPACE_KINDS = exports.WorkspaceKind = void 0;
    exports.workspaceKindIconKey = workspaceKindIconKey;
    exports.WorkspaceKind = {
        Usual: 'usual',
        Workflow: 'workflow',
    };
    /**
     * 所有可创建的工作区类型（「添加工作区」下拉框就按这个数组渲染，几项＝几个选项）。
     * 以后新增类型只改这一处，下拉框/侧栏自动多一项。
     */
    exports.WORKSPACE_KINDS = [
        { id: exports.WorkspaceKind.Usual, label: '目录工作区', description: '把一个本地目录作为工作区，里面是一组会话', iconKey: 'folder' },
        { id: exports.WorkspaceKind.Workflow, label: '工作流工作区', description: '树形任务分解 + 五态状态机，节点可与会话绑定', iconKey: 'tree' },
    ];
    /** 按类型取图标键（未知类型回落到文件夹）。 */
    function workspaceKindIconKey(kind) {
        return exports.WORKSPACE_KINDS.find((definition) => definition.id === kind)?.iconKey ?? 'folder';
    }
    //# sourceMappingURL=workspace-kind.js.map
    },
    "client/workspace-ui.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.rowsClass = rowsClass;
    exports.joinClasses = joinClasses;
    exports.menuPointFromEvent = menuPointFromEvent;
    exports.menuAnchorRect = menuAnchorRect;
    exports.WorkspaceKindIcon = WorkspaceKindIcon;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * 侧栏工作区共享的 UI 原语（CSS 类解析 + 类型图标 + 菜单坐标）。
     * 只依赖 react / ui-primitives / workspace-kind，不依赖 workspace-browser 或 workflow，
     * 供两个解耦模块各自 import。
     */
    const workspace_kind_1 = __req("client/workspace-kind.js");
    const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
    /** 宿主 Rows 模块的 CSS Modules 哈希前缀（运行时反查，不硬编码）。 */
    let rowsPrefixCache;
    function rowsPrefix() {
        if (rowsPrefixCache !== undefined)
            return rowsPrefixCache;
        rowsPrefixCache = null;
        try {
            for (const sheet of Array.from(document.styleSheets)) {
                let rules;
                try {
                    rules = sheet.cssRules;
                }
                catch {
                    continue;
                }
                for (const rule of Array.from(rules ?? [])) {
                    const selector = rule?.selectorText;
                    if (typeof selector !== 'string' || !selector.includes('_sessionRow'))
                        continue;
                    const matched = /\.([A-Za-z0-9]+)_sessionRow/.exec(selector);
                    if (matched !== null) {
                        rowsPrefixCache = matched[1];
                        return rowsPrefixCache;
                    }
                }
            }
        }
        catch {
            rowsPrefixCache = null;
        }
        return rowsPrefixCache;
    }
    function rowsClass(name) {
        const prefix = rowsPrefix();
        return prefix === null ? undefined : `${prefix}_${name}`;
    }
    function joinClasses(...values) {
        const kept = values.filter((value) => typeof value === 'string' && value !== '');
        return kept.length === 0 ? undefined : kept.join(' ');
    }
    /**
     * 从点击事件里取「触发按钮左下角」的屏幕坐标。
     *
     * 为什么不用 Menu 的 `anchor` 传元素：这个版本的 ui-primitives Menu 不测量 React 元素，
     * 只认 `getAnchorRect()`；传元素会让菜单落在默认位置（越靠下的行偏得越远）。
     */
    function menuPointFromEvent(event) {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (rect === undefined || rect === null)
            return { x: 8, y: 8 };
        return { x: rect.left, y: rect.bottom + 2 };
    }
    /** 把上面那个坐标包成 Menu 需要的零尺寸矩形。 */
    function menuAnchorRect(point) {
        return new DOMRect(point.x, point.y, 0, 0);
    }
    /** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
    function WorkspaceKindIcon(props) {
        const size = props.size ?? 16;
        if ((0, workspace_kind_1.workspaceKindIconKey)(props.kind) === 'tree') {
            return ((0, jsx_runtime_1.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("rect", { x: "9", y: "3", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "3", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "15", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7v3" }), (0, jsx_runtime_1.jsx)("path", { d: "M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" })] }));
        }
        return props.expanded === false
            ? (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderCloseRegular, { size: size })
            : (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderOpenRegular, { size: size });
    }
    //# sourceMappingURL=workspace-ui.js.map
    },
    "client/workspace-kind-registry.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.registerWorkspaceKindPlugin = registerWorkspaceKindPlugin;
    exports.getWorkspaceKindPlugin = getWorkspaceKindPlugin;
    exports.nonUsualWorkspaceKinds = nonUsualWorkspaceKinds;
    exports.normalizeWorkspacePath = normalizeWorkspacePath;
    exports.workspaceKindClaims = workspaceKindClaims;
    const plugins = new Map();
    function registerWorkspaceKindPlugin(plugin) {
        plugins.set(plugin.kind, plugin);
    }
    function getWorkspaceKindPlugin(kind) {
        return plugins.get(kind);
    }
    /** 侧栏需要合并显示的非 usual 类型（当前只有 workflow）。 */
    function nonUsualWorkspaceKinds() {
        return Array.from(plugins.keys());
    }
    /** 目录路径归一化：Windows 下大小写、路径分隔符、结尾斜杠都不敏感。 */
    function normalizeWorkspacePath(path) {
        return path.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
    }
    /** 这一项类型工作区是否认领了某个宿主目录工作区。 */
    function workspaceKindClaims(kind, item, workspace) {
        const plugin = plugins.get(kind);
        if (plugin === undefined || typeof plugin.matchWorkspace !== 'function')
            return false;
        return plugin.matchWorkspace(item, workspace) === true;
    }
    //# sourceMappingURL=workspace-kind-registry.js.map
    },
    "client/workflow-embedded.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.workflowKindPlugin = void 0;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * workflow 工作区模块（与 workspace-browser 解耦）。
     *
     * 只通过 `workspace-kind-registry` 的 `registerWorkspaceKindPlugin` 把自己挂进侧栏，
     * 不 import `workspace-browser`；共享的只有 `workspace-kind`（枚举）、`workspace-ui`（CSS/图标原语）、
     * `../schema/node-state-label`（状态中文名）。
     */
    const react_1 = require("react");
    const workspace_kind_1 = __req("client/workspace-kind.js");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const workspace_ui_1 = __req("client/workspace-ui.js");
    const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
    const workspace_kind_registry_1 = __req("client/workspace-kind-registry.js");
    /** 五态单向推进表。 */
    const NEXT_NODE_STATE = {
        not_started: 'discussing',
        discussing: 'implementing',
        implementing: 'verifying',
        verifying: 'completed',
        completed: null,
    };
    /** 状态点的颜色。 */
    const NODE_STATE_COLOR = {
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
    async function createWorkflow(path, context) {
        const hostWorkspaceId = typeof context?.workspaceId === 'string' ? context.workspaceId : undefined;
        const response = await fetch('/dsh-agent-workflow/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(hostWorkspaceId === undefined ? { path } : { path, hostWorkspaceId }),
        });
        const data = await response.json().catch(() => null);
        if (data?.ok !== true)
            throw new Error(String(data?.error ?? '创建失败'));
    }
    /** 从客户端 ctx 取服务：优先 ctx.get（取不到时回退属性访问）。 */
    function readClientService(ctx, serviceName) {
        if (ctx === undefined || ctx === null)
            return undefined;
        if (typeof ctx.get === 'function') {
            try {
                const viaGet = ctx.get(serviceName);
                if (viaGet !== undefined && viaGet !== null)
                    return viaGet;
            }
            catch {
                // 继续走属性访问
            }
        }
        try {
            return ctx[serviceName];
        }
        catch {
            return undefined;
        }
    }
    /**
     * workflow 工作区的可嵌入渲染：与 usual 工作区同一套交互——
     * 工作区行有「⋯」和「新建子会话」；节点行点击打开该节点绑定的会话。
     */
    function WorkflowWorkspaceItem(props) {
        const { summary, collapsed, onToggle, onChanged, runtime } = props;
        const ctx = runtime?.ctx;
        const currentSessionId = runtime?.currentSessionId ?? null;
        const [snapshot, setSnapshot] = (0, react_1.useState)(null);
        const [loading, setLoading] = (0, react_1.useState)(false);
        const [workspaceMenuPoint, setWorkspaceMenuPoint] = (0, react_1.useState)(null);
        /** 正在打开的节点菜单：节点 id + 触发按钮的屏幕坐标。 */
        const [nodeMenu, setNodeMenu] = (0, react_1.useState)(null);
        /** 正在「新建会话 + 绑定」的节点，避免连点重复建会话。 */
        const [busyNodeId, setBusyNodeId] = (0, react_1.useState)(null);
        const load = async () => {
            if (snapshot !== null)
                return;
            setLoading(true);
            try {
                const response = await fetch(`/dsh-agent-workflow/get?id=${encodeURIComponent(summary.id)}`);
                const data = await response.json();
                if (data?.ok === true)
                    setSnapshot(data.snapshot);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 读取 workflow 失败：', error);
            }
            finally {
                setLoading(false);
            }
        };
        (0, react_1.useEffect)(() => {
            if (!collapsed)
                void load();
        }, [collapsed]);
        const addChildTo = async (parentId) => {
            try {
                const response = await fetch('/dsh-agent-workflow/add-node', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: summary.id, parentId, title: '新子会话' }),
                });
                const data = await response.json();
                if (data?.ok === true)
                    setSnapshot(data.snapshot);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 新建子会话失败：', error);
            }
        };
        const transition = async (nodeId, to) => {
            try {
                const response = await fetch('/dsh-agent-workflow/transition', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: summary.id, nodeId, to }),
                });
                const data = await response.json();
                if (data?.ok === true)
                    setSnapshot(data.snapshot);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 推进状态失败：', error);
            }
        };
        /**
         * 找到（必要时补建）该目录对应的宿主「目录工作区」。
         * 会话必须挂在真实工作区上，否则打开后只会停在「选择工作区」。
         */
        const resolveWorkspaceId = async (workingDirectory) => {
            // workflow 自己就是某个宿主目录工作区，快照里记着就直接用。
            const recorded = snapshot?.host_workspace_id;
            if (typeof recorded === 'string' && recorded !== '')
                return recorded;
            const existing = typeof runtime?.findWorkspaceIdByPath === 'function'
                ? runtime.findWorkspaceIdByPath(workingDirectory)
                : null;
            if (existing !== null && existing !== undefined && existing !== '')
                return existing;
            const workspacesService = readClientService(ctx, 'workspaces');
            if (workspacesService === undefined || typeof workspacesService.create !== 'function')
                return null;
            try {
                const created = await workspacesService.create({ path: workingDirectory });
                const createdId = typeof created?.workspaceId === 'string'
                    ? created.workspaceId
                    : (typeof created?.id === 'string' ? created.id : null);
                return createdId;
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 补建目录工作区失败：', error);
                return null;
            }
        };
        /**
         * 点击节点行：打开该节点对应的会话。
         * 已绑定 → 直接 openSession；未绑定 → 在 workflow 的工作目录所属的工作区里新建会话，
         * 写回节点后打开（写回失败也照样打开，不阻塞用户看会话）。
         */
        const openNodeSession = async (node) => {
            if (busyNodeId !== null)
                return;
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
                }
                catch (error) {
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
                const createdSessionId = await sessions.create(workspaceId !== null && workspaceId !== ''
                    ? { workspaceId }
                    : (workingDirectory !== '' ? { cwd: workingDirectory } : {}));
                if (typeof createdSessionId !== 'string' || createdSessionId === '')
                    throw new Error('新建会话没有返回 id');
                try {
                    const response = await fetch('/dsh-agent-workflow/bind-session', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ id: summary.id, nodeId: node.node_id, sessionId: createdSessionId }),
                    });
                    const data = await response.json().catch(() => null);
                    if (data?.ok === true)
                        setSnapshot(data.snapshot);
                    else
                        console.error('[dsh-agent-workflow] 绑定会话失败：', data);
                }
                catch (bindError) {
                    console.error('[dsh-agent-workflow] 绑定会话失败：', bindError);
                }
                uiWorkspace.openSession(createdSessionId);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 打开节点会话失败：', error);
            }
            finally {
                setBusyNodeId(null);
            }
        };
        const rootId = snapshot?.workspace_id ?? summary.id;
        const byId = new Map((snapshot?.nodes ?? []).map((node) => [node.node_id, node]));
        const renderNodeRow = (node, depth) => {
            const nextState = NEXT_NODE_STATE[node.current_state] ?? null;
            /** 根节点代表工作区本身，不绑会话：点它只做展开/折叠。 */
            const isRootNode = node.parent_id === null;
            const children = (node.child_ids ?? [])
                .map((id) => byId.get(id))
                .filter((child) => child !== undefined);
            /** 该节点绑定的会话正是当前打开的会话时，行保持选中态。 */
            const isCurrent = currentSessionId !== null
                && typeof node.session_id === 'string'
                && node.session_id !== ''
                && node.session_id === currentSessionId;
            return ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "aria-selected": isCurrent, className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('sessionRow'), isCurrent && (0, workspace_ui_1.rowsClass)('selected')), title: isRootNode ? '工作区根节点' : (busyNodeId === node.node_id ? '正在打开会话…' : '点击打开该节点的会话'), onClick: () => {
                            if (isRootNode)
                                onToggle();
                            else
                                void openNodeSession(node);
                        }, style: {
                            paddingLeft: 4 + depth * 14,
                            cursor: isRootNode ? 'default' : (busyNodeId === node.node_id ? 'progress' : 'pointer'),
                            opacity: busyNodeId === node.node_id ? 0.6 : 1,
                        }, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('slot'), children: (0, jsx_runtime_1.jsx)("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: node.title ?? node.node_type }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('rowResting'), children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('time'), children: node_state_label_1.NODE_STATE_LABEL[node.current_state] ?? node.current_state }) }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [isRootNode ? null : ((0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": nodeMenu?.nodeId === node.node_id, onClick: (event) => {
                                            const point = (0, workspace_ui_1.menuPointFromEvent)(event);
                                            const nodeSessionId = typeof node.session_id === 'string' && node.session_id !== '' ? node.session_id : null;
                                            if (nodeSessionId !== null) {
                                                // 已绑定会话：直接打开宿主原生的「会话」菜单（置顶/重命名/复制 ID/归档…全都有）。
                                                setNodeMenu(null);
                                                runtime?.requestSessionMenu?.(nodeSessionId, node.title ?? '', point);
                                                return;
                                            }
                                            setNodeMenu((current) => (current !== null && current.nodeId === node.node_id ? null : { nodeId: node.node_id, ...point }));
                                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) })), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: nextState === null ? '已完结' : `推进到 ${node_state_label_1.NODE_STATE_LABEL[nextState] ?? nextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: nextState === null, onClick: () => {
                                                if (nextState !== null)
                                                    void transition(node.node_id, nextState);
                                            }, style: { opacity: nextState === null ? 0.35 : 1 }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5 12h13" }), (0, jsx_runtime_1.jsx)("path", { d: "m12.5 6 6 6-6 6" })] }) }) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: (0, jsx_runtime_1.jsx)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: (0, jsx_runtime_1.jsx)("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
        };
        const rootNode = byId.get(rootId);
        return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: (0, workspace_ui_1.rowsClass)('sessionRow'), children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: (0, jsx_runtime_1.jsx)(workspace_ui_1.WorkspaceKindIcon, { kind: workspace_kind_1.WorkspaceKind.Workflow }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('chevron')), onClick: onToggle, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTriangleRightFillRegular, { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('arrow'), !collapsed && (0, workspace_ui_1.rowsClass)('arrowOpen')) }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('projectText'), onClick: onToggle, children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: summary.title }) }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": workspaceMenuPoint !== null, onClick: (event) => {
                                        const point = (0, workspace_ui_1.menuPointFromEvent)(event);
                                        setWorkspaceMenuPoint((current) => (current === null ? point : null));
                                    }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "8" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? ((0, jsx_runtime_1.jsx)("div", { style: { paddingBottom: 4 }, children: loading ? ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : rootNode ? (renderNodeRow(rootNode, 0)) : null })) : null, workspaceMenuPoint !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(workspaceMenuPoint), items: [
                        { id: 'rename', label: '重命名', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEditOutlineRegular, {}) },
                        { id: 'delete', label: '删除工作区', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTrashOutlineRegular, {}), danger: true },
                    ], onClose: () => setWorkspaceMenuPoint(null), onSelect: (id) => {
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
                        if (id === 'rename')
                            runtime?.requestRenameWorkspace?.(workspaceId, summary.title ?? '');
                        else if (id === 'delete')
                            runtime?.requestDeleteWorkspace?.(workspaceId);
                    } })) : null, nodeMenu !== null ? (() => {
                    const menuNode = byId.get(nodeMenu.nodeId);
                    if (menuNode === undefined)
                        return null;
                    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(nodeMenu), items: [{ id: 'child', label: '新建子会话' }], onClose: () => setNodeMenu(null), onSelect: (id) => {
                            if (id === 'child')
                                void addChildTo(menuNode.node_id);
                        } }));
                })() : null] }));
    }
    exports.workflowKindPlugin = {
        kind: workspace_kind_1.WorkspaceKind.Workflow,
        list: listWorkflows,
        create: createWorkflow,
        /**
         * 认领一个宿主目录工作区：优先按 workspaceId，旧快照没有就按目录路径比对。
         * 认领之后侧栏不再把它当 usual 渲染，同一个目录因此只有一行。
         */
        matchWorkspace: (item, workspace) => {
            const itemWorkspaceId = typeof item.workspaceId === 'string' ? item.workspaceId : null;
            const hostWorkspaceId = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : null;
            if (itemWorkspaceId !== null && hostWorkspaceId !== null)
                return itemWorkspaceId === hostWorkspaceId;
            const itemPath = typeof item.path === 'string' ? (0, workspace_kind_registry_1.normalizeWorkspacePath)(item.path) : '';
            const hostPath = typeof workspace.path === 'string' ? (0, workspace_kind_registry_1.normalizeWorkspacePath)(workspace.path) : '';
            return itemPath !== '' && hostPath !== '' && itemPath === hostPath;
        },
        renderItem: (summary, collapsed, onToggle, onChanged, runtime) => ((0, jsx_runtime_1.jsx)(WorkflowWorkspaceItem, { summary: summary, collapsed: collapsed, onToggle: onToggle, onChanged: onChanged, runtime: runtime })),
    };
    //# sourceMappingURL=workflow-embedded.js.map
    },
    "schema/node-state-label.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NODE_STATE_LABEL = void 0;
    /**
     * 状态中文名（UI 显示用）。
     *
     * 单独成文件的原因：客户端半（浏览器）要用这张表，但 `node-state.ts` 里
     * 有 zod 的运行时依赖，客户端模块表并不提供 zod。客户端只从这里取值，
     * 就不会把 zod 拖进浏览器包（否则整个客户端 entry 会在启动时失败）。
     */
    exports.NODE_STATE_LABEL = {
        not_started: '未开始',
        discussing: '讨论中',
        implementing: '实现中',
        verifying: '验收中',
        completed: '已完结',
    };
    //# sourceMappingURL=node-state-label.js.map
    },
    };
    var __cache = {};
    function __req(key) {
      if (__cache[key]) return __cache[key].exports;
      var m = { exports: {} };
      __cache[key] = m;
      __mods[key](__req, m, m.exports);
      return m.exports;
    }
    return __req("client/dsh-plugin.js");
  }
});
