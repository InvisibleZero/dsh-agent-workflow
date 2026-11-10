import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Menu, Tooltip, IconEllipsisOutlineRegular, IconTriangleRightFillRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
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
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
    const [openNodeId, setOpenNodeId] = useState(null);
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
    useEffect(() => {
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
        return (_jsxs("div", { children: [_jsxs("div", { role: "treeitem", className: rowsClass('sessionRow'), style: { paddingLeft: 4 + depth * 14 }, children: [_jsx("span", { className: rowsClass('slot'), children: _jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), _jsx("span", { className: rowsClass('title'), children: node.title ?? node.node_type }), _jsx("span", { className: rowsClass('time'), children: NODE_STATE_LABEL[node.current_state] ?? node.current_state }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx(Menu, { open: openNodeId === node.node_id, onClose: () => setOpenNodeId(null), items: menuItems, onSelect: (id) => {
                                        setOpenNodeId(null);
                                        if (id === 'child')
                                            void addChildTo(node.node_id);
                                    }, portal: true, closeOnPointerLeave: true, anchor: (_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", onClick: () => setOpenNodeId((previous) => (previous === node.node_id ? null : node.node_id)), children: _jsx(IconEllipsisOutlineRegular, {}) })) }), _jsx(Tooltip, { label: nextState === null ? '已完结' : `推进到 ${NODE_STATE_LABEL[nextState] ?? nextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: nextState === null, onClick: () => {
                                            if (nextState !== null)
                                                void transition(node.node_id, nextState);
                                        }, style: { opacity: nextState === null ? 0.35 : 1 }, children: _jsxs("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("path", { d: "M5 12h13" }), _jsx("path", { d: "m12.5 6 6 6-6 6" })] }) }) }), _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: _jsx("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: _jsx("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
    };
    const rootNode = byId.get(rootId);
    return (_jsxs("div", { className: rowsClass('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [_jsxs("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: rowsClass('sessionRow'), children: [_jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: _jsx(WorkspaceKindIcon, { kind: WorkspaceKind.Workflow }) }), _jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('chevron')), onClick: onToggle, children: _jsx(IconTriangleRightFillRegular, { className: joinClasses(rowsClass('arrow'), !collapsed && rowsClass('arrowOpen')) }) }), _jsx("span", { className: rowsClass('projectText'), onClick: onToggle, children: _jsx("span", { className: rowsClass('title'), children: summary.title }) }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx(Menu, { open: workspaceMenuOpen, onClose: () => setWorkspaceMenuOpen(false), items: [
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
                                }, portal: true, closeOnPointerLeave: true, anchor: (_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", onClick: () => setWorkspaceMenuOpen((value) => !value), children: _jsx(IconEllipsisOutlineRegular, {}) })) }), _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: _jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? (_jsx("div", { style: { paddingBottom: 4 }, children: loading ? (_jsx("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : rootNode ? (renderNodeRow(rootNode, 0)) : null })) : null] }));
}
export const workflowKindPlugin = {
    kind: WorkspaceKind.Workflow,
    list: listWorkflows,
    create: createWorkflow,
    renderItem: (summary, collapsed, onToggle, onChanged) => (_jsx(WorkflowWorkspaceItem, { summary: summary, collapsed: collapsed, onToggle: onToggle, onChanged: onChanged })),
};
//# sourceMappingURL=workflow-embedded.js.map