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
    const workflow_dialogs_1 = __req("client/workflow-dialogs.js");
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
        // 输入框工具条里的 workflow 状态徽标（权限控件右边）。挂不上不影响侧栏主功能。
        try {
            (0, workflow_embedded_1.applyWorkflowComposerBadge)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 状态徽标注册失败：', error);
        }
        // 设置页里的「操作细节」（应用级全局 A/B/C/D）。
        try {
            (0, workflow_dialogs_1.applyWorkflowSettingsSection)(ctx);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 设置分区注册失败：', error);
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
                                event.currentTarget.focus({ preventScroll: true });
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
            { type: 'label', id: 'group-by', text: '分组方式' },
            { id: 'workspace', label: '按工作区分组', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFolderCloseRegular, {}) },
            { id: 'workspace-tree', label: '工作区树', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconWorkspaceTreeOutlineRegular, {}) },
            { id: 'flat', label: '平铺', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconFlatListOutlineRegular, {}) },
            { type: 'separator', id: 'sep-order' },
            { type: 'label', id: 'order-by', text: '排序方式' },
            { id: 'manual', label: '手动排序', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconChevronsUpDownOutlineRegular, {}) },
            { id: 'updated', label: '按更新时间', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconClockOutlineRegular, {}) },
            { type: 'separator', id: 'sep-filter' },
            { type: 'label', id: 'filter-by', text: '归档过滤' },
            { id: 'hide-archived', label: '隐藏已归档', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconArchiveOffOutlineRegular, {}) },
            { id: 'show-archived', label: '显示已归档', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconQueueOutlineRegular, {}) },
            { id: 'only-archived', label: '只看已归档', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconArchiveCheckOutlineRegular, {}) },
        ];
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u89C6\u56FE\u9009\u9879", side: "bottom", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u89C6\u56FE\u9009\u9879", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                            event.currentTarget.focus({ preventScroll: true });
                            const next = (0, workspace_ui_1.menuPointFromEvent)(event);
                            setPoint((current) => (current === null ? next : null));
                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconSlidersTwoOutlineRegular, {}) }) }), point !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", dense: true, listClassName: C.viewOptionsMenu, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(point), items: items, selectedIds: [props.groupBy, props.orderBy, archivedFilterToId[props.archivedFilter]], onClose: () => setPoint(null), onSelect: (id) => {
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
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5DE5\u4F5C\u533A", side: "bottom", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: C.iconButton, "aria-label": "\u65B0\u5EFA\u5DE5\u4F5C\u533A", "aria-haspopup": "menu", "aria-expanded": point !== null, onClick: (event) => {
                            event.currentTarget.focus({ preventScroll: true });
                            const next = (0, workspace_ui_1.menuPointFromEvent)(event);
                            setPoint((current) => (current === null ? next : null));
                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconProjectAddOutlineRegular, { size: 16 }) }) }), point !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(point), items: items, onClose: () => setPoint(null), onSelect: (id) => {
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
        /** 搜索框容器与输入框：点击容器展开并聚焦，和宿主一致。 */
        const searchRootRef = (0, react_1.useRef)(null);
        const searchInputRef = (0, react_1.useRef)(null);
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
            requestRenameSession: (sessionId, currentTitle) => {
                setRenameTarget({ kind: 'session', id: sessionId, title: currentTitle });
                setRenameDraft(currentTitle);
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
        return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.joinClasses)(C.root, wide ? C.wide : C.rail), style: { position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.joinClasses)(C.sectionHeader, wide ? C.searchSpacingMotion : undefined), children: [wide ? ((0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)(C.sectionLabel, C.wide, searchOpen ? C.sectionLabelHidden : undefined), children: "\u5DE5\u4F5C\u533A" })) : null, wide ? ((0, jsx_runtime_1.jsx)("div", { className: (0, workspace_ui_1.joinClasses)(C.searchSlot, searchOpen ? C.searchSlotExpanded : undefined), children: (0, jsx_runtime_1.jsxs)("div", { ref: searchRootRef, className: (0, workspace_ui_1.joinClasses)(C.search, searchOpen ? C.searchExpanded : undefined), onClick: () => {
                                    setSearchOpen(true);
                                    searchInputRef.current?.focus();
                                }, children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u641C\u7D22", side: "bottom", delayMs: 500, disabled: searchOpen, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: C.searchButton, "aria-label": "\u641C\u7D22\u4F1A\u8BDD", "aria-expanded": searchOpen, onClick: () => {
                                                if (searchOpen) {
                                                    setQuery('');
                                                    setSearchOpen(false);
                                                }
                                                else {
                                                    setSearchOpen(true);
                                                    searchInputRef.current?.focus();
                                                }
                                            }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconSearchOutlineRegular, { size: searchOpen ? 11 : 14 }) }) }), (0, jsx_runtime_1.jsx)("input", { ref: searchInputRef, className: C.searchInput, type: "text", placeholder: "\u641C\u7D22\u4F1A\u8BDD\u540D\u79F0", tabIndex: searchOpen ? 0 : -1, value: query, onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
                                            if (event.key !== 'Escape')
                                                return;
                                            setQuery('');
                                            setSearchOpen(false);
                                        } }), searchOpen ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: C.clearButton, "aria-label": "\u6E05\u9664\u641C\u7D22", onClick: (event) => {
                                            event.stopPropagation();
                                            setQuery('');
                                            setSearchOpen(false);
                                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconCloseFillRegular, {}) })) : null] }) })) : null, (0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.joinClasses)(C.headerActions, wide && searchOpen ? C.headerActionsHidden : undefined), children: [(0, jsx_runtime_1.jsx)(ViewOptionsMenu, { groupBy: viewOptions.groupBy, orderBy: viewOptions.orderBy, archivedFilter: viewOptions.archivedFilter, onChange: (patch) => setViewOptions((previous) => ({ ...previous, ...patch })) }), (0, jsx_runtime_1.jsx)(AddWorkspaceMenu, { onSelectKind: (kind) => void addWorkspace(kind) })] })] }), (0, jsx_runtime_1.jsx)("div", { className: C.listArea, style: { flex: 1, overflow: 'auto', minHeight: 0 }, children: flatSessions.length === 0 && Object.values(pluginItems).every((items) => items.length === 0) ? ((0, jsx_runtime_1.jsx)("div", { className: C.emptyState, children: (0, jsx_runtime_1.jsx)("div", { className: C.empty, children: keyword === '' ? '还没有工作区' : '没有匹配的会话' }) })) : ((0, jsx_runtime_1.jsx)("div", { className: C.list, children: viewOptions.groupBy === 'flat' ? (flatSessions.map(renderSessionRow)) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [workspaceItems.map((ws) => {
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
    exports.applyWorkflowComposerBadge = applyWorkflowComposerBadge;
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
    const workflow_dialogs_1 = __req("client/workflow-dialogs.js");
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
        /** 节点补充说明弹窗（由会话里的状态徽标点开，但在这棵树里渲染，避免输入框容器的 transform 让 fixed 弹窗跑偏）。 */
        const [nodeDetailNodeId, setNodeDetailNodeId] = (0, react_1.useState)(null);
        const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
        const returnToNodeRef = (0, react_1.useRef)(null);
        /** 正在「新建会话 + 绑定」的节点，避免连点重复建会话。 */
        const [busyNodeId, setBusyNodeId] = (0, react_1.useState)(null);
        // 会话里的状态徽标只发事件，弹窗由这里渲染（输入框容器带 transform，fixed 会跑偏）。
        (0, react_1.useEffect)(() => {
            const onOpenNodeDetail = (event) => {
                const nodeId = event?.detail?.nodeId;
                if (typeof nodeId === 'string' && nodeId !== '')
                    setNodeDetailNodeId(nodeId);
            };
            window.addEventListener('dsh-agent-workflow:open-node-detail', onOpenNodeDetail);
            return () => window.removeEventListener('dsh-agent-workflow:open-node-detail', onOpenNodeDetail);
        }, []);
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
        /**
         * 节点绑定的会话在宿主里的实时状态。
         * 复用宿主菜单做置顶/归档/改名时，行必须反映结果，否则用户以为菜单没生效。
         */
        const sessionsById = readClientService(ctx, 'sessions')?.list?.getSnapshot?.()?.byId ?? {};
        const workspaceSnapshot = readClientService(ctx, 'workspaces')?.list?.getSnapshot?.() ?? null;
        const pinnedSessionIds = new Set(workspaceSnapshot?.pinnedSessionIds ?? []);
        const archivedSessionIds = new Set(workspaceSnapshot?.archivedSessionIds ?? []);
        /**
         * 节点置顶的语义由我们定义：**同级之内排到最前**（宿主只负责把会话标记成 pinned）。
         * 排序稳定：未置顶的节点保持 child_ids 原顺序。
         */
        const isNodePinned = (node) => (typeof node?.session_id === 'string' && node.session_id !== '' && pinnedSessionIds.has(node.session_id));
        const sortNodesPinnedFirst = (nodes) => ([...nodes].sort((left, right) => Number(isNodePinned(right)) - Number(isNodePinned(left))));
        /**
         * 节点会话菜单的动作。全部走宿主的 uiWorkspace / sessions 服务，
         * 这样置顶、归档、重命名的状态与侧栏其它地方保持一致。
         */
        const runSessionMenuAction = async (actionId, sessionId, node) => {
            const uiWorkspace = readClientService(ctx, 'uiWorkspace');
            try {
                if (actionId === 'pin') {
                    if (pinnedSessionIds.has(sessionId))
                        await uiWorkspace?.unpinSession?.(sessionId);
                    else
                        await uiWorkspace?.pinSession?.(sessionId);
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
                    const copied = await (0, dsh_client_ui_primitives_1.writeClipboard)(sessionId);
                    if (copied !== true)
                        console.warn('[dsh-agent-workflow] 复制会话 ID 失败');
                }
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 会话菜单操作失败：', error);
            }
        };
        const renderNodeRow = (node, depth) => {
            const sessionId = typeof node.session_id === 'string' && node.session_id !== '' ? node.session_id : null;
            const sessionSummary = sessionId === null ? undefined : sessionsById[sessionId];
            const sessionTitle = typeof sessionSummary?.title === 'string' ? sessionSummary.title.trim() : '';
            /** 行标题优先跟随会话名（重命名会话后立刻可见），没有会话名才回退节点标题。 */
            const displayTitle = sessionTitle !== '' ? sessionTitle : (node.title || '未命名会话');
            const isPinned = sessionId !== null && pinnedSessionIds.has(sessionId);
            const isArchived = sessionId !== null && archivedSessionIds.has(sessionId);
            const children = sortNodesPinnedFirst((node.child_ids ?? [])
                .map((id) => byId.get(id))
                .filter((child) => child !== undefined));
            /** 该节点绑定的会话正是当前打开的会话时，行保持选中态。 */
            const isCurrent = currentSessionId !== null
                && sessionId !== null
                && sessionId === currentSessionId;
            return ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "aria-selected": isCurrent, className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('sessionRow'), isArchived && (0, workspace_ui_1.rowsClass)('archived'), isCurrent && (0, workspace_ui_1.rowsClass)('selected')), title: isArchived
                            ? '该会话已归档，先在「⋯」里取消归档'
                            : (busyNodeId === node.node_id ? '正在打开会话…' : '点击打开该节点的会话'), onClick: () => {
                            if (isArchived)
                                return;
                            void openNodeSession(node);
                        }, style: {
                            paddingLeft: 4 + depth * 14,
                            cursor: busyNodeId === node.node_id ? 'progress' : 'pointer',
                            opacity: busyNodeId === node.node_id ? 0.6 : (isArchived ? 0.55 : 1),
                        }, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('slot'), children: (0, jsx_runtime_1.jsx)("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: displayTitle }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowResting'), children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('time'), children: isArchived
                                            ? '已归档'
                                            : (node_state_label_1.NODE_STATE_LABEL[node.current_state] ?? node.current_state) }), isPinned ? (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPinFillRegular, { size: 12 }) : null] }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": nodeMenu?.nodeId === node.node_id, onClick: (event) => {
                                            // 先把焦点落到触发按钮：菜单关闭时要把焦点还回来，
                                            // 否则菜单隐藏时焦点仍在菜单项上，浏览器会报 aria-hidden 警告。
                                            event.currentTarget.focus({ preventScroll: true });
                                            const point = (0, workspace_ui_1.menuPointFromEvent)(event);
                                            setNodeMenu((current) => (current !== null && current.nodeId === node.node_id ? null : { nodeId: node.node_id, ...point }));
                                        }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: (0, jsx_runtime_1.jsx)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: (0, jsx_runtime_1.jsx)("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
        };
        const rootNode = byId.get(rootId);
        /** 根节点的状态直接显示在工作区行上（根节点不再单独占一行）。 */
        const rootState = typeof rootNode?.current_state === 'string' ? rootNode.current_state : null;
        const rootNextState = rootState === null ? null : (NEXT_NODE_STATE[rootState] ?? null);
        const rootChildNodes = sortNodesPinnedFirst((rootNode?.child_ids ?? [])
            .map((id) => byId.get(id))
            .filter((child) => child !== undefined));
        return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: (0, workspace_ui_1.rowsClass)('sessionRow'), children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: (0, jsx_runtime_1.jsx)(workspace_ui_1.WorkspaceKindIcon, { kind: workspace_kind_1.WorkspaceKind.Workflow }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('chevron')), onClick: onToggle, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTriangleRightFillRegular, { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('arrow'), !collapsed && (0, workspace_ui_1.rowsClass)('arrowOpen')) }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('projectText'), onClick: onToggle, children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: summary.title }) }), rootState !== null ? ((0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('rowResting'), children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('time'), children: node_state_label_1.NODE_STATE_LABEL[rootState] ?? rootState }) })) : null, (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": workspaceMenuPoint !== null, onClick: (event) => {
                                        event.currentTarget.focus({ preventScroll: true });
                                        const point = (0, workspace_ui_1.menuPointFromEvent)(event);
                                        setWorkspaceMenuPoint((current) => (current === null ? point : null));
                                    }, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) }), rootNode !== undefined ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: rootNextState === null ? '已完结' : `推进到 ${node_state_label_1.NODE_STATE_LABEL[rootNextState] ?? rootNextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: rootNextState === null, onClick: () => {
                                            if (rootNextState !== null)
                                                void transition(rootNode.node_id, rootNextState);
                                        }, style: { opacity: rootNextState === null ? 0.35 : 1 }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5 12h13" }), (0, jsx_runtime_1.jsx)("path", { d: "m12.5 6 6 6-6 6" })] }) }) })) : null, (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "8" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? ((0, jsx_runtime_1.jsx)("div", { style: { paddingBottom: 4 }, children: loading ? ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : (rootChildNodes.map((child) => renderNodeRow(child, 1))) })) : null, workspaceMenuPoint !== null ? ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(workspaceMenuPoint), items: [
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
                    const menuSessionId = typeof menuNode.session_id === 'string' && menuNode.session_id !== ''
                        ? menuNode.session_id
                        : null;
                    if (menuSessionId === null) {
                        return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(nodeMenu), items: [{ id: 'child', label: '新建子会话' }], onClose: () => setNodeMenu(null), onSelect: (id) => {
                                if (id === 'child')
                                    void addChildTo(menuNode.node_id);
                            } }));
                    }
                    const menuPinned = pinnedSessionIds.has(menuSessionId);
                    const menuArchived = archivedSessionIds.has(menuSessionId);
                    // 注意：这里不出现「分叉会话」——workflow 节点会话不允许分叉（会破坏节点与会话的一一对应）。
                    const items = menuArchived
                        ? [{ id: 'unarchive', label: '取消归档', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconUnarchiveOutlineRegular, {}) }]
                        : [
                            { id: 'pin', label: menuPinned ? '取消置顶' : '置顶会话', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconPinOutlineRegular, {}) },
                            { id: 'rename', label: '重命名', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEditOutlineRegular, {}) },
                            { id: 'copy-id', label: '复制 Session ID', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconCopyOutlineRegular, {}) },
                            { id: 'archive', label: '归档会话', icon: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconArchiveOutlineRegular, {}), separatorBefore: true },
                        ];
                    return ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => (0, workspace_ui_1.menuAnchorRect)(nodeMenu), items: items, onClose: () => setNodeMenu(null), onSelect: (id) => void runSessionMenuAction(id, menuSessionId, menuNode) }));
                })() : null, nodeDetailNodeId !== null ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowNodeDetailDialog, { workflowId: summary.id, nodeId: nodeDetailNodeId, onClose: () => setNodeDetailNodeId(null), onOpenSettings: () => {
                        returnToNodeRef.current = nodeDetailNodeId;
                        setSettingsOpen(true);
                    } })) : null, settingsOpen ? ((0, jsx_runtime_1.jsx)(workflow_dialogs_1.WorkflowSettingsDialog, { onClose: () => {
                        setSettingsOpen(false);
                        const back = returnToNodeRef.current;
                        returnToNodeRef.current = null;
                        if (back !== null)
                            setNodeDetailNodeId(back);
                    } })) : null] }));
    }
    /**
     * 输入框工具条里的 workflow 状态徽标：
     * 当前会话若是某个 workflow 节点绑定的会话，就在权限控件右边显示该节点的状态。
     */
    function WorkflowStateBadge(props) {
        const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
        const [nodeInfo, setNodeInfo] = (0, react_1.useState)(null);
        const [advancing, setAdvancing] = (0, react_1.useState)(false);
        const readNode = async () => {
            try {
                const response = await fetch(`/dsh-agent-workflow/node-by-session?sessionId=${encodeURIComponent(sessionId)}`);
                const data = await response.json().catch(() => null);
                const node = data?.ok === true ? data.node : null;
                if (node === null || node === undefined) {
                    setNodeInfo(null);
                    return null;
                }
                const info = {
                    state: String(node.current_state),
                    workflowId: String(node.workflowId),
                    nodeId: String(node.nodeId),
                    enterTrigger: typeof node.enter_trigger === 'string' ? node.enter_trigger : '',
                };
                setNodeInfo(info);
                return info;
            }
            catch {
                setNodeInfo(null);
                return null;
            }
        };
        /**
         * 把「进入后默认输入」填进当前输入框（半自动：不发送，用户自己按回车）。
         * InputActions 的方法名在 build 里没有类型，按常见命名逐个试，失败只告警不抛。
         */
        const pushDraft = (text) => {
            const actions = props?.inputActions;
            if (actions === undefined || actions === null || text === '')
                return false;
            const candidates = ['setText', 'setDraft', 'replaceText', 'insertText', 'appendText', 'setValue', 'insert', 'append'];
            for (const name of candidates) {
                const method = actions[name];
                if (typeof method !== 'function')
                    continue;
                try {
                    method.call(actions, text);
                    return true;
                }
                catch (error) {
                    console.warn('[dsh-agent-workflow] 写入默认输入失败：', name, error);
                }
            }
            console.warn('[dsh-agent-workflow] 输入框没有可用的写入方法，现有方法：', Object.keys(actions).join(','));
            return false;
        };
        (0, react_1.useEffect)(() => {
            if (sessionId === '') {
                setNodeInfo(null);
                return undefined;
            }
            let cancelled = false;
            const tick = async () => {
                if (cancelled)
                    return;
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
        if (nodeInfo === null)
            return null;
        const label = node_state_label_1.NODE_STATE_LABEL[nodeInfo.state] ?? nodeInfo.state;
        const nextState = NEXT_NODE_STATE[nodeInfo.state] ?? null;
        /** 推进：写状态 → 刷新徽标 → 把新状态的默认输入填进输入框（不自动发送）。 */
        const advance = async () => {
            if (nextState === null || advancing)
                return;
            setAdvancing(true);
            try {
                await fetch('/dsh-agent-workflow/transition', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: nodeInfo.workflowId, nodeId: nodeInfo.nodeId, to: nextState }),
                });
                const info = await readNode();
                if (info !== null && info.enterTrigger !== '')
                    pushDraft(info.enterTrigger);
            }
            catch (error) {
                console.error('[dsh-agent-workflow] 推进状态失败：', error);
            }
            finally {
                setAdvancing(false);
            }
        };
        return ((0, jsx_runtime_1.jsxs)("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", title: "\u67E5\u770B / \u7F16\u8F91\u672C\u8282\u70B9\u7684\u64CD\u4F5C\u7EC6\u8282", onClick: () => {
                        // 弹窗由侧栏那棵树渲染：输入框所在容器带 transform，fixed 定位会歪。
                        window.dispatchEvent(new CustomEvent('dsh-agent-workflow:open-node-detail', {
                            detail: { workflowId: nodeInfo.workflowId, nodeId: nodeInfo.nodeId },
                        }));
                    }, style: {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 22,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid transparent',
                        background: 'var(--dsw-alias-bg-layer-1)',
                        color: 'var(--dsw-alias-label-secondary)',
                        fontSize: 11,
                        lineHeight: '22px',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                    }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: [(0, jsx_runtime_1.jsx)("span", { style: { width: 6, height: 6, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[nodeInfo.state] ?? 'transparent' } }), label] }), nextState === null ? null : ((0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: `推进到 ${node_state_label_1.NODE_STATE_LABEL[nextState] ?? nextState}`, side: "top", delayMs: 400, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: advancing, onClick: () => void advance(), style: {
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
                        }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5 12h13" }), (0, jsx_runtime_1.jsx)("path", { d: "m12.5 6 6 6-6 6" })] }) }) }))] }));
    }
    /** 把状态徽标挂到输入框工具条的左侧控件区（权限控件的右边）。 */
    function applyWorkflowComposerBadge(ctx) {
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
            name: 'conversation.input.left',
            id: 'dsh-agent-workflow.state',
            order: 10,
            label: 'workflow 状态',
        }, WorkflowStateBadge));
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
    "client/workflow-dialogs.js": function(__req, module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WorkflowGlobalSettingsSection = WorkflowGlobalSettingsSection;
    exports.applyWorkflowSettingsSection = applyWorkflowSettingsSection;
    exports.WorkflowSettingsDialog = WorkflowSettingsDialog;
    exports.WorkflowNodeDetailDialog = WorkflowNodeDetailDialog;
    const jsx_runtime_1 = require("react/jsx-runtime");
    // @ts-nocheck
    /**
     * workflow 的界面块：
     * - 设置页里的「操作细节」分区（应用级全局 A + B/C/D，四个页签）；
     * - 节点操作细节弹窗（只读展示该节点生效的 A + B/C/D，标出覆盖项）。
     *
     * 样式全部用主题变量内联，深浅色自动跟随，不依赖 CSS Module。
     */
    const react_1 = require("react");
    const node_state_label_1 = __req("schema/node-state-label.js");
    const LABEL_STYLE = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4, display: 'block' };
    const FIELD_STYLE = {
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: '6px 8px',
        fontSize: 12,
        lineHeight: 1.5,
        resize: 'vertical',
        fontFamily: 'inherit',
    };
    const OVERLAY_STYLE = { position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,.45)' };
    const PANEL_STYLE = {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 560,
        maxWidth: '92vw',
        maxHeight: '82vh',
        overflow: 'auto',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,.4)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        zIndex: 1200,
    };
    function Modal(props) {
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: OVERLAY_STYLE, onClick: props.onClose }), (0, jsx_runtime_1.jsxs)("div", { style: PANEL_STYLE, role: "dialog", "aria-label": props.title, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [(0, jsx_runtime_1.jsx)("strong", { style: { fontSize: 14 }, children: props.title }), (0, jsx_runtime_1.jsx)("button", { type: "button", "aria-label": "\u5173\u95ED", onClick: props.onClose, style: { border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }, children: "\u00D7" })] }), props.children] })] }));
    }
    const STATE_TABS = [
        { id: 'shared', label: '公共' },
        { id: 'discussing', label: '讨论中' },
        { id: 'implementing', label: '实现中' },
        { id: 'verifying', label: '验收中' },
    ];
    /**
     * 设置页里的「操作细节」分区内容。
     * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
     */
    function WorkflowGlobalSettingsSection() {
        const [detail, setDetail] = (0, react_1.useState)(null);
        const [activeTab, setActiveTab] = (0, react_1.useState)('shared');
        const [status, setStatus] = (0, react_1.useState)('idle');
        const [error, setError] = (0, react_1.useState)(null);
        const timerRef = (0, react_1.useRef)(null);
        const latestRef = (0, react_1.useRef)(null);
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch('/dsh-agent-workflow/global-settings');
                    const data = await response.json().catch(() => null);
                    if (cancelled)
                        return;
                    if (data?.ok === true)
                        setDetail(data.globalOperationDetail);
                    else
                        setError(String(data?.error ?? '读取设置失败'));
                }
                catch (reason) {
                    if (!cancelled)
                        setError(String(reason));
                }
            })();
            return () => { cancelled = true; };
        }, []);
        /** 真正落盘：只由防抖计时器或卸载时的兜底调用。 */
        const persist = async (value) => {
            setStatus('saving');
            setError(null);
            try {
                const response = await fetch('/dsh-agent-workflow/global-settings-save', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ globalOperationDetail: value }),
                });
                const data = await response.json().catch(() => null);
                if (data?.ok === true) {
                    setStatus('saved');
                    window.setTimeout(() => setStatus((current) => (current === 'saved' ? 'idle' : current)), 1600);
                }
                else {
                    setStatus('error');
                    setError(String(data?.error ?? '保存失败'));
                }
            }
            catch (reason) {
                setStatus('error');
                setError(String(reason));
            }
        };
        /** 改动即排一次防抖保存（700ms），不需要「保存」按钮。 */
        const update = (next) => {
            setDetail(next);
            latestRef.current = next;
            setStatus('pending');
            setError(null);
            if (timerRef.current !== null)
                clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                void persist(next);
            }, 700);
        };
        // 卸载（关设置页）时把还没落盘的改动补写一次，避免丢最后几个字。
        (0, react_1.useEffect)(() => () => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
                if (latestRef.current !== null)
                    void persist(latestRef.current);
            }
        }, []);
        if (detail === null) {
            return (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }, children: error ?? '加载中…' });
        }
        const patchTab = (tabId, patch) => (update({ ...detail, [tabId]: { ...detail[tabId], ...patch } }));
        return ((0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 12 }, children: "\u8FD9\u4E9B\u64CD\u4F5C\u7EC6\u8282\u662F\u5E94\u7528\u7EA7\u5168\u5C40\u7684\uFF0C\u6240\u6709 workflow \u8282\u70B9\u5728\u5BF9\u5E94\u72B6\u6001\u4E0B\u90FD\u4F1A\u8BFB\u5230\uFF1B\u8282\u70B9\u53EF\u4EE5\u5355\u72EC\u8986\u76D6\u81EA\u5DF1\u5F53\u524D\u72B6\u6001\u90A3\u4E00\u6761\u3002" }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l1)', marginBottom: 12 }, children: STATE_TABS.map((tab) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                            padding: '6px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                            cursor: 'pointer',
                            fontSize: 12,
                        }, children: tab.label }, tab.id))) }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', height: 380 }, children: activeTab === 'shared' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282 \u00B7 \u4E09\u6001\u901A\u7528" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 auto' }, value: detail.shared_detail ?? '', onChange: (event) => update({ ...detail, shared_detail: event.target.value }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("label", { style: LABEL_STYLE, children: "\u8FDB\u5165\u8BE5\u72B6\u6001\u540E\u81EA\u52A8\u704C\u5165\u8F93\u5165\u6846\u7684\u9ED8\u8BA4\u6587\u672C\uFF08\u53EF\u7A7A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '0 0 20%', resize: 'none' }, value: detail[activeTab]?.enter_trigger ?? '', placeholder: "\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u704C\u5165", onChange: (event) => patchTab(activeTab, { enter_trigger: event.target.value === '' ? null : event.target.value }) }), (0, jsx_runtime_1.jsx)("label", { style: { ...LABEL_STYLE, marginTop: 10 }, children: "\u8BE5\u72B6\u6001\u7684\u64CD\u4F5C\u7EC6\u8282" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, flex: '1 1 80%' }, value: detail[activeTab]?.operation_detail ?? '', onChange: (event) => patchTab(activeTab, { operation_detail: event.target.value }) })] })) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: status === 'pending' ? '待保存…'
                                : status === 'saving' ? '保存中…'
                                    : status === 'saved' ? '已自动保存'
                                        : status === 'error' ? '' : '改动会自动保存' }), error !== null ? (0, jsx_runtime_1.jsx)("span", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null] })] }));
    }
    /** 设置左侧导航里的图标（与侧栏 workflow 工作区同一套树形图标）。 */
    function WorkflowSectionIcon() {
        return ((0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("rect", { x: "9", y: "3", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "3", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("rect", { x: "15", y: "16", width: "6", height: "4", rx: "1" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 7v3" }), (0, jsx_runtime_1.jsx)("path", { d: "M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" })] }));
    }
    /** 把「操作细节」分区挂进 设置 → 左侧导航。 */
    function applyWorkflowSettingsSection(ctx) {
        const sectionId = 'dsh-agent-workflow';
        ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: sectionId,
            order: 50,
            label: 'Agent 工作流',
        }, WorkflowGlobalSettingsSection));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id: sectionId }, WorkflowSectionIcon));
    }
    /** 全局操作细节的独立弹窗版（与设置页共用同一个编辑组件）。 */
    function WorkflowSettingsDialog(props) {
        return ((0, jsx_runtime_1.jsx)(Modal, { title: "\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E\uFF08\u5168\u5C40\uFF09", onClose: props.onClose, children: (0, jsx_runtime_1.jsx)(WorkflowGlobalSettingsSection, {}) }));
    }
    /** 节点补充说明弹窗：只编辑这个节点自己的附加说明，全局内容去设置里看。 */
    function WorkflowNodeDetailDialog(props) {
        const { workflowId, nodeId, onClose, onOpenSettings } = props;
        const [payload, setPayload] = (0, react_1.useState)(null);
        const [error, setError] = (0, react_1.useState)(null);
        (0, react_1.useEffect)(() => {
            let cancelled = false;
            void (async () => {
                try {
                    const response = await fetch(`/dsh-agent-workflow/node-detail?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
                    const data = await response.json().catch(() => null);
                    if (cancelled)
                        return;
                    if (data?.ok === true)
                        setPayload(data);
                    else
                        setError(String(data?.error ?? '读取失败'));
                }
                catch (reason) {
                    if (!cancelled)
                        setError(String(reason));
                }
            })();
            return () => { cancelled = true; };
        }, [workflowId, nodeId]);
        const currentState = payload?.node?.current_state ?? null;
        const labels = { discussing: '讨论中', implementing: '实现中', verifying: '验收中' };
        const [notes, setNotes] = (0, react_1.useState)({});
        const [noteStatus, setNoteStatus] = (0, react_1.useState)(null);
        const timers = (0, react_1.useRef)({});
        // 读到数据后把节点自己的附加说明灌进本地草稿。
        (0, react_1.useEffect)(() => {
            if (payload === null)
                return;
            setNotes({
                global: String(payload.additional?.global ?? ''),
                discussing: String(payload.additional?.discussing ?? ''),
                implementing: String(payload.additional?.implementing ?? ''),
                verifying: String(payload.additional?.verifying ?? ''),
            });
        }, [payload]);
        /** 附加说明：防抖 700ms 自动保存到该节点，不影响全局设置。 */
        const saveNote = (state, text) => {
            setNotes((current) => ({ ...current, [state]: text }));
            if (timers.current[state] !== undefined)
                clearTimeout(timers.current[state]);
            setNoteStatus('待保存…');
            timers.current[state] = window.setTimeout(async () => {
                timers.current[state] = undefined;
                setNoteStatus('保存中…');
                try {
                    const response = await fetch('/dsh-agent-workflow/node-note', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ id: workflowId, nodeId, state, text }),
                    });
                    const data = await response.json().catch(() => null);
                    setNoteStatus(data?.ok === true ? '已保存' : String(data?.error ?? '保存失败'));
                }
                catch (reason) {
                    setNoteStatus(String(reason));
                }
            }, 700);
        };
        return ((0, jsx_runtime_1.jsxs)(Modal, { title: `节点补充说明 · ${payload?.node?.title ?? '节点'}`, onClose: onClose, children: [error !== null ? (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: error }) : null, payload === null ? ((0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: ["\u5F53\u524D\u72B6\u6001\uFF1A", node_state_label_1.NODE_STATE_LABEL[currentState] ?? currentState, noteStatus === null ? '' : `　${noteStatus}`] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                        // 先关掉当前弹窗，再让上层打开设置：避免两层遮罩叠在一起。
                                        onOpenSettings?.();
                                        onClose();
                                    }, style: {
                                        height: 24,
                                        padding: '0 10px',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        border: '1px solid var(--dsw-alias-border-l1)',
                                        background: 'transparent',
                                        color: 'var(--dsw-alias-brand-primary)',
                                    }, children: "\u6253\u5F00\u64CD\u4F5C\u7EC6\u8282\u8BBE\u7F6E \u2192" })] }), (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 10 }, children: "\u5168\u5C40\u7684\u64CD\u4F5C\u7EC6\u8282\u5728\u300C\u8BBE\u7F6E \u2192 Agent \u5DE5\u4F5C\u6D41\u300D\u91CC\uFF1B\u8FD9\u91CC\u53EA\u5199\u8FD9\u4E2A\u8282\u70B9\u989D\u5916\u8981\u6CE8\u610F\u7684\uFF0C\u4F1A\u63A5\u5728\u5168\u5C40\u540E\u9762\u3002" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                border: '1px solid var(--dsw-alias-border-l1)',
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 10,
                            }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u672C\u8282\u70B9\u9644\u52A0\uFF08\u6240\u6709\u72B6\u6001\u90FD\u4F1A\u8FFD\u52A0\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes.global ?? '', onChange: (event) => saveNote('global', event.target.value) })] }), ['discussing', 'implementing', 'verifying'].map((state) => {
                            return ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    border: '1px solid var(--dsw-alias-border-l1)',
                                    borderRadius: 8,
                                    padding: 10,
                                    marginBottom: 10,
                                    background: currentState === state ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 600, marginBottom: 6 }, children: [labels[state], currentState === state ? (0, jsx_runtime_1.jsx)("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--dsw-alias-brand-primary)' }, children: "\u5F53\u524D\u6001" }) : null] }), (0, jsx_runtime_1.jsx)("textarea", { style: { ...FIELD_STYLE, minHeight: 52 }, placeholder: "\u7559\u7A7A\u5219\u4E0D\u8FFD\u52A0", value: notes[state] ?? '', onChange: (event) => saveNote(state, event.target.value) })] }, state));
                        })] }))] }));
    }
    //# sourceMappingURL=workflow-dialogs.js.map
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
