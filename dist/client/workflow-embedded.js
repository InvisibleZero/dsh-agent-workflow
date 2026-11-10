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
import { rowsClass, joinClasses, WorkspaceKindIcon, menuPointFromEvent, menuAnchorRect } from './workspace-ui';
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
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [workspaceMenuPoint, setWorkspaceMenuPoint] = useState(null);
    /** 正在打开的节点菜单：节点 id + 触发按钮的屏幕坐标。 */
    const [nodeMenu, setNodeMenu] = useState(null);
    /** 正在「新建会话 + 绑定」的节点，避免连点重复建会话。 */
    const [busyNodeId, setBusyNodeId] = useState(null);
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
    /**
     * 找到（必要时补建）该目录对应的宿主「目录工作区」。
     * 会话必须挂在真实工作区上，否则打开后只会停在「选择工作区」。
     */
    const resolveWorkspaceId = async (workingDirectory) => {
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
            uiWorkspace.openSession(boundSessionId);
            return;
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
    /** 解除旧绑定后立刻重建一个挂在工作区上的会话（用于修复“选工作区”那种空壳会话）。 */
    const rebindNode = async (node) => {
        try {
            const response = await fetch('/dsh-agent-workflow/bind-session', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: summary.id, nodeId: node.node_id, sessionId: '' }),
            });
            const data = await response.json().catch(() => null);
            if (data?.ok === true)
                setSnapshot(data.snapshot);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 解除绑定失败：', error);
        }
        await openNodeSession({ ...node, session_id: undefined });
    };
    const rootId = snapshot?.workspace_id ?? summary.id;
    const byId = new Map((snapshot?.nodes ?? []).map((node) => [node.node_id, node]));
    const renderNodeRow = (node, depth) => {
        const nextState = NEXT_NODE_STATE[node.current_state] ?? null;
        const children = (node.child_ids ?? [])
            .map((id) => byId.get(id))
            .filter((child) => child !== undefined);
        /** 该节点绑定的会话正是当前打开的会话时，行保持选中态。 */
        const isCurrent = currentSessionId !== null
            && typeof node.session_id === 'string'
            && node.session_id !== ''
            && node.session_id === currentSessionId;
        return (_jsxs("div", { children: [_jsxs("div", { role: "treeitem", "aria-selected": isCurrent, className: joinClasses(rowsClass('sessionRow'), isCurrent && rowsClass('selected')), title: busyNodeId === node.node_id ? '正在打开会话…' : '点击打开该节点的会话', onClick: () => void openNodeSession(node), style: {
                        paddingLeft: 4 + depth * 14,
                        cursor: busyNodeId === node.node_id ? 'progress' : 'pointer',
                        opacity: busyNodeId === node.node_id ? 0.6 : 1,
                    }, children: [_jsx("span", { className: rowsClass('slot'), children: _jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), _jsx("span", { className: rowsClass('title'), children: node.title ?? node.node_type }), _jsx("span", { className: rowsClass('time'), children: NODE_STATE_LABEL[node.current_state] ?? node.current_state }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": nodeMenu?.nodeId === node.node_id, onClick: (event) => {
                                        const point = menuPointFromEvent(event);
                                        setNodeMenu((current) => (current !== null && current.nodeId === node.node_id ? null : { nodeId: node.node_id, ...point }));
                                    }, children: _jsx(IconEllipsisOutlineRegular, {}) }), _jsx(Tooltip, { label: nextState === null ? '已完结' : `推进到 ${NODE_STATE_LABEL[nextState] ?? nextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: nextState === null, onClick: () => {
                                            if (nextState !== null)
                                                void transition(node.node_id, nextState);
                                        }, style: { opacity: nextState === null ? 0.35 : 1 }, children: _jsxs("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("path", { d: "M5 12h13" }), _jsx("path", { d: "m12.5 6 6 6-6 6" })] }) }) }), _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: _jsx("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: _jsx("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
    };
    const rootNode = byId.get(rootId);
    return (_jsxs("div", { className: rowsClass('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [_jsxs("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: rowsClass('sessionRow'), children: [_jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: _jsx(WorkspaceKindIcon, { kind: WorkspaceKind.Workflow }) }), _jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('chevron')), onClick: onToggle, children: _jsx(IconTriangleRightFillRegular, { className: joinClasses(rowsClass('arrow'), !collapsed && rowsClass('arrowOpen')) }) }), _jsx("span", { className: rowsClass('projectText'), onClick: onToggle, children: _jsx("span", { className: rowsClass('title'), children: summary.title }) }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": workspaceMenuPoint !== null, onClick: (event) => {
                                    const point = menuPointFromEvent(event);
                                    setWorkspaceMenuPoint((current) => (current === null ? point : null));
                                }, children: _jsx(IconEllipsisOutlineRegular, {}) }), _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: _jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? (_jsx("div", { style: { paddingBottom: 4 }, children: loading ? (_jsx("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : rootNode ? (renderNodeRow(rootNode, 0)) : null })) : null, workspaceMenuPoint !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(workspaceMenuPoint), items: [
                    { id: 'pin', label: summary.pinned === true ? '取消置顶' : '置顶' },
                    { id: 'child', label: '新建子会话' },
                    { id: 'reload', label: '刷新' },
                ], onClose: () => setWorkspaceMenuPoint(null), onSelect: (id) => {
                    if (id === 'pin')
                        void togglePinned();
                    else if (id === 'child')
                        void addChildTo(rootId);
                    else if (id === 'reload')
                        void load();
                } })) : null, nodeMenu !== null ? (() => {
                const menuNode = byId.get(nodeMenu.nodeId);
                if (menuNode === undefined)
                    return null;
                const isBound = typeof menuNode.session_id === 'string' && menuNode.session_id !== '';
                return (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(nodeMenu), items: isBound
                        ? [{ id: 'child', label: '新建子会话' }, { id: 'rebind', label: '重新绑定会话' }]
                        : [{ id: 'child', label: '新建子会话' }], onClose: () => setNodeMenu(null), onSelect: (id) => {
                        if (id === 'child')
                            void addChildTo(menuNode.node_id);
                        else if (id === 'rebind')
                            void rebindNode(menuNode);
                    } }));
            })() : null] }));
}
export const workflowKindPlugin = {
    kind: WorkspaceKind.Workflow,
    list: listWorkflows,
    create: createWorkflow,
    renderItem: (summary, collapsed, onToggle, onChanged, runtime) => (_jsx(WorkflowWorkspaceItem, { summary: summary, collapsed: collapsed, onToggle: onToggle, onChanged: onChanged, runtime: runtime })),
};
//# sourceMappingURL=workflow-embedded.js.map