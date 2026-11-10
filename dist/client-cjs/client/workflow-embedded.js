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
const workspace_kind_1 = require("./workspace-kind");
const node_state_label_1 = require("../schema/node-state-label");
const workspace_ui_1 = require("./workspace-ui");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
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
async function createWorkflow(path) {
    const response = await fetch('/dsh-agent-workflow/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
    });
    const data = await response.json().catch(() => null);
    if (data?.ok !== true)
        throw new Error(String(data?.error ?? '创建失败'));
}
/**
 * workflow 工作区的可嵌入渲染：与 usual 工作区同一套交互——
 * 工作区行有「⋯」和「新建子会话」；每个节点行也是「⋯ + 新建子会话」。
 */
function WorkflowWorkspaceItem(props) {
    const { summary, collapsed, onToggle, onChanged } = props;
    const [snapshot, setSnapshot] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = (0, react_1.useState)(false);
    const [openNodeId, setOpenNodeId] = (0, react_1.useState)(null);
    /** 置顶 / 取消置顶：写我们自己的 workflow 快照，然后让侧栏重拉列表重排。 */
    const togglePinned = async () => {
        try {
            const response = await fetch('/dsh-agent-workflow/pin', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: summary.id, pinned: summary.pinned !== true }),
            });
            const data = await response.json();
            if (data?.ok === true)
                onChanged?.();
            else
                console.error('[dsh-agent-workflow] 置顶 workflow 失败：', data);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 置顶 workflow 失败：', error);
        }
    };
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
    const rootId = snapshot?.workspace_id ?? summary.id;
    const byId = new Map((snapshot?.nodes ?? []).map((node) => [node.node_id, node]));
    const renderNodeRow = (node, depth) => {
        const nextState = NEXT_NODE_STATE[node.current_state] ?? null;
        // 「推进」已拆成独立的 → 按钮，菜单里只留「新建子会话」。
        const menuItems = [{ id: 'child', label: '新建子会话' }];
        const children = (node.child_ids ?? [])
            .map((id) => byId.get(id))
            .filter((child) => child !== undefined);
        return ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", className: (0, workspace_ui_1.rowsClass)('sessionRow'), style: { paddingLeft: 4 + depth * 14 }, children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('slot'), children: (0, jsx_runtime_1.jsx)("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: node.title ?? node.node_type }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('time'), children: node_state_label_1.NODE_STATE_LABEL[node.current_state] ?? node.current_state }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: openNodeId === node.node_id, onClose: () => setOpenNodeId(null), items: menuItems, onSelect: (id) => {
                                        setOpenNodeId(null);
                                        if (id === 'child')
                                            void addChildTo(node.node_id);
                                    }, portal: true, closeOnPointerLeave: true, anchor: ((0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", onClick: () => setOpenNodeId((previous) => (previous === node.node_id ? null : node.node_id)), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) })) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: nextState === null ? '已完结' : `推进到 ${node_state_label_1.NODE_STATE_LABEL[nextState] ?? nextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: nextState === null, onClick: () => {
                                            if (nextState !== null)
                                                void transition(node.node_id, nextState);
                                        }, style: { opacity: nextState === null ? 0.35 : 1 }, children: (0, jsx_runtime_1.jsxs)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M5 12h13" }), (0, jsx_runtime_1.jsx)("path", { d: "m12.5 6 6 6-6 6" })] }) }) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: (0, jsx_runtime_1.jsx)("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: (0, jsx_runtime_1.jsx)("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
    };
    const rootNode = byId.get(rootId);
    return ((0, jsx_runtime_1.jsxs)("div", { className: (0, workspace_ui_1.rowsClass)('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [(0, jsx_runtime_1.jsxs)("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: (0, workspace_ui_1.rowsClass)('sessionRow'), children: [(0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: (0, jsx_runtime_1.jsx)(workspace_ui_1.WorkspaceKindIcon, { kind: workspace_kind_1.WorkspaceKind.Workflow }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('slot'), (0, workspace_ui_1.rowsClass)('chevron')), onClick: onToggle, children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconTriangleRightFillRegular, { className: (0, workspace_ui_1.joinClasses)((0, workspace_ui_1.rowsClass)('arrow'), !collapsed && (0, workspace_ui_1.rowsClass)('arrowOpen')) }) }), (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('projectText'), onClick: onToggle, children: (0, jsx_runtime_1.jsx)("span", { className: (0, workspace_ui_1.rowsClass)('title'), children: summary.title }) }), (0, jsx_runtime_1.jsxs)("span", { className: (0, workspace_ui_1.rowsClass)('rowActions'), onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Menu, { open: workspaceMenuOpen, onClose: () => setWorkspaceMenuOpen(false), items: [
                                    { id: 'pin', label: summary.pinned === true ? '取消置顶' : '置顶' },
                                    { id: 'child', label: '新建子会话' },
                                    { id: 'reload', label: '刷新' },
                                ], onSelect: (id) => {
                                    setWorkspaceMenuOpen(false);
                                    if (id === 'pin')
                                        void togglePinned();
                                    else if (id === 'child')
                                        void addChildTo(rootId);
                                    else if (id === 'reload')
                                        void load();
                                }, portal: true, closeOnPointerLeave: true, anchor: ((0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", onClick: () => setWorkspaceMenuOpen((value) => !value), children: (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.IconEllipsisOutlineRegular, {}) })) }), (0, jsx_runtime_1.jsx)(dsh_client_ui_primitives_1.Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: (0, jsx_runtime_1.jsx)("button", { type: "button", className: (0, workspace_ui_1.rowsClass)('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: (0, jsx_runtime_1.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "8" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? ((0, jsx_runtime_1.jsx)("div", { style: { paddingBottom: 4 }, children: loading ? ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : rootNode ? (renderNodeRow(rootNode, 0)) : null })) : null] }));
}
exports.workflowKindPlugin = {
    kind: workspace_kind_1.WorkspaceKind.Workflow,
    list: listWorkflows,
    create: createWorkflow,
    renderItem: (summary, collapsed, onToggle, onChanged) => ((0, jsx_runtime_1.jsx)(WorkflowWorkspaceItem, { summary: summary, collapsed: collapsed, onToggle: onToggle, onChanged: onChanged })),
};
//# sourceMappingURL=workflow-embedded.js.map