import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
/**
 * workflow 工作区模块（与 workspace-browser 解耦）。
 *
 * 只通过 `workspace-kind-registry` 的 `registerWorkspaceKindPlugin` 把自己挂进侧栏，
 * 不 import `workspace-browser`；共享的只有 `workspace-kind`（枚举）、`workspace-ui`（CSS/图标原语）、
 * `../schema/node-state-label`（状态中文名）。
 */
import { useEffect, useRef, useState } from 'react';
import { WorkspaceKind } from './workspace-kind';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { WorkflowNodeDetailDialog, WorkflowSettingsDialog, WorkflowConfirmDialog } from './workflow-dialogs';
import { rowsClass, joinClasses, WorkspaceKindIcon, menuPointFromEvent, menuAnchorRect } from './workspace-ui';
import { Menu, Tooltip, IconEllipsisOutlineRegular, IconTriangleRightFillRegular, IconEditOutlineRegular, IconTrashOutlineRegular, IconPinFillRegular, IconPinOutlineRegular, IconCopyOutlineRegular, IconArchiveOutlineRegular, IconUnarchiveOutlineRegular, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import { normalizeWorkspacePath } from './workspace-kind-registry';
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
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [workspaceMenuPoint, setWorkspaceMenuPoint] = useState(null);
    /** 正在打开的节点菜单：节点 id + 触发按钮的屏幕坐标。 */
    const [nodeMenu, setNodeMenu] = useState(null);
    /** 节点补充说明弹窗（由会话里的状态徽标点开，但在这棵树里渲染，避免输入框容器的 transform 让 fixed 弹窗跑偏）。 */
    const [nodeDetailNodeId, setNodeDetailNodeId] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const returnToNodeRef = useRef(null);
    /** 正在「新建会话 + 绑定」的节点，避免连点重复建会话。 */
    const [busyNodeId, setBusyNodeId] = useState(null);
    /** 待确认删除的工作区（删除不可逆，先过一层确认）。 */
    const [pendingDelete, setPendingDelete] = useState(null);
    /** 待确认「进入实现中」的推进请求（由会话徽标发起，在这棵树里弹漂亮确认框）。 */
    const [pendingAdvanceConfirm, setPendingAdvanceConfirm] = useState(null);
    // 会话里的状态徽标只发事件，弹窗由这里渲染（输入框容器带 transform，fixed 会跑偏）。
    useEffect(() => {
        const onOpenNodeDetail = (event) => {
            const nodeId = event?.detail?.nodeId;
            if (typeof nodeId === 'string' && nodeId !== '')
                setNodeDetailNodeId(nodeId);
        };
        const onConfirmAdvance = (event) => {
            const detail = event?.detail ?? {};
            if (detail.workflowId !== summary.id)
                return;
            if (typeof detail.requestId !== 'string' || typeof detail.nodeId !== 'string')
                return;
            setPendingAdvanceConfirm({ requestId: detail.requestId, nodeId: detail.nodeId });
        };
        window.addEventListener('dsh-agent-workflow:open-node-detail', onOpenNodeDetail);
        window.addEventListener('dsh-agent-workflow:confirm-advance', onConfirmAdvance);
        return () => {
            window.removeEventListener('dsh-agent-workflow:open-node-detail', onOpenNodeDetail);
            window.removeEventListener('dsh-agent-workflow:confirm-advance', onConfirmAdvance);
        };
    }, [summary.id]);
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
        if (busyNodeId !== null)
            return;
        setBusyNodeId(parentId);
        try {
            const response = await fetch('/dsh-agent-workflow/add-node', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: summary.id, parentId, title: '新子会话' }),
            });
            const data = await response.json();
            if (data?.ok !== true)
                throw new Error(String(data?.error ?? '新建子节点失败'));
            const nodeId = typeof data.nodeId === 'string' ? data.nodeId : '';
            setSnapshot(data.snapshot);
            // 子节点 = 子会话：顺带建会话并绑定。cwd 用工作区根（手册在 .workflow 平铺，隔离靠注入）。
            if (nodeId !== '') {
                const workingDirectory = typeof snapshot?.working_directory === 'string' ? snapshot.working_directory : '';
                const workspaceId = workingDirectory !== '' ? await resolveWorkspaceId(workingDirectory) : null;
                const sessions = readClientService(ctx, 'sessions');
                if (sessions !== undefined && typeof sessions.create === 'function') {
                    const createdSessionId = await sessions.create(workspaceId !== null && workspaceId !== '' ? { workspaceId } : {});
                    if (typeof createdSessionId === 'string' && createdSessionId !== '') {
                        const bindResponse = await fetch('/dsh-agent-workflow/bind-session', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ id: summary.id, nodeId, sessionId: createdSessionId }),
                        });
                        const bindData = await bindResponse.json().catch(() => null);
                        if (bindData?.ok === true)
                            setSnapshot(bindData.snapshot);
                    }
                }
            }
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 新建子会话失败：', error);
        }
        finally {
            setBusyNodeId(null);
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
                const copied = await writeClipboard(sessionId);
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
        return (_jsxs("div", { children: [_jsxs("div", { role: "treeitem", "aria-selected": isCurrent, className: joinClasses(rowsClass('sessionRow'), isArchived && rowsClass('archived'), isCurrent && rowsClass('selected')), title: isArchived
                        ? '该会话已归档，先在「⋯」里取消归档'
                        : (busyNodeId === node.node_id ? '正在打开会话…' : '点击打开该节点的会话'), onClick: () => {
                        if (isArchived)
                            return;
                        void openNodeSession(node);
                    }, style: {
                        paddingLeft: 4 + depth * 14,
                        cursor: busyNodeId === node.node_id ? 'progress' : 'pointer',
                        opacity: busyNodeId === node.node_id ? 0.6 : (isArchived ? 0.55 : 1),
                    }, children: [_jsx("span", { className: rowsClass('slot'), children: _jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[node.current_state] ?? 'transparent' } }) }), _jsx("span", { className: rowsClass('title'), children: displayTitle }), _jsxs("span", { className: rowsClass('rowResting'), children: [_jsx("span", { className: rowsClass('time'), children: isArchived
                                        ? '已归档'
                                        : (NODE_STATE_LABEL[node.current_state] ?? node.current_state) }), isPinned ? _jsx(IconPinFillRegular, { size: 12 }) : null] }), _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u4F1A\u8BDD\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": nodeMenu?.nodeId === node.node_id, onClick: (event) => {
                                        // 先把焦点落到触发按钮：菜单关闭时要把焦点还回来，
                                        // 否则菜单隐藏时焦点仍在菜单项上，浏览器会报 aria-hidden 警告。
                                        event.currentTarget.focus({ preventScroll: true });
                                        const point = menuPointFromEvent(event);
                                        setNodeMenu((current) => (current !== null && current.nodeId === node.node_id ? null : { nodeId: node.node_id, ...point }));
                                    }, children: _jsx(IconEllipsisOutlineRegular, {}) }), _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(node.node_id), children: _jsx("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: _jsx("path", { d: "M12 6v12M6 12h12" }) }) }) })] })] }), children.map((child) => renderNodeRow(child, depth + 1))] }, node.node_id));
    };
    const rootNode = byId.get(rootId);
    /** 根节点的状态直接显示在工作区行上（根节点不再单独占一行）。 */
    const rootState = typeof rootNode?.current_state === 'string' ? rootNode.current_state : null;
    const rootNextState = rootState === null ? null : (NEXT_NODE_STATE[rootState] ?? null);
    const rootChildNodes = sortNodesPinnedFirst((rootNode?.child_ids ?? [])
        .map((id) => byId.get(id))
        .filter((child) => child !== undefined));
    return (_jsxs("div", { className: rowsClass('groupSection'), style: { display: 'flex', flexDirection: 'column', '--dsh-workspace-indent': '0px' }, children: [_jsxs("div", { role: "treeitem", "data-row-key": `workflow:${summary.id}`, "aria-expanded": !collapsed, className: rowsClass('sessionRow'), children: [_jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('folder')), style: { color: '#4d7bfd' }, onClick: onToggle, children: _jsx(WorkspaceKindIcon, { kind: WorkspaceKind.Workflow }) }), _jsx("span", { className: joinClasses(rowsClass('slot'), rowsClass('chevron')), onClick: onToggle, children: _jsx(IconTriangleRightFillRegular, { className: joinClasses(rowsClass('arrow'), !collapsed && rowsClass('arrowOpen')) }) }), _jsx("span", { className: rowsClass('projectText'), onClick: onToggle, children: _jsx("span", { className: rowsClass('title'), children: summary.title }) }), rootState !== null ? (_jsx("span", { className: rowsClass('rowResting'), children: _jsx("span", { className: rowsClass('time'), children: NODE_STATE_LABEL[rootState] ?? rootState }) })) : null, _jsxs("span", { className: rowsClass('rowActions'), onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u5DE5\u4F5C\u533A\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": workspaceMenuPoint !== null, onClick: (event) => {
                                    event.currentTarget.focus({ preventScroll: true });
                                    const point = menuPointFromEvent(event);
                                    setWorkspaceMenuPoint((current) => (current === null ? point : null));
                                }, children: _jsx(IconEllipsisOutlineRegular, {}) }), rootNode !== undefined ? (_jsx(Tooltip, { label: rootNextState === null ? '已完结' : `推进到 ${NODE_STATE_LABEL[rootNextState] ?? rootNextState}`, side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: rootNextState === null, onClick: () => {
                                        if (rootNextState !== null)
                                            void transition(rootNode.node_id, rootNextState);
                                    }, style: { opacity: rootNextState === null ? 0.35 : 1 }, children: _jsxs("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("path", { d: "M5 12h13" }), _jsx("path", { d: "m12.5 6 6 6-6 6" })] }) }) })) : null, _jsx(Tooltip, { label: "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", side: "bottom", align: "end", delayMs: 500, portal: true, children: _jsx("button", { type: "button", className: rowsClass('iconButton'), "aria-label": "\u65B0\u5EFA\u5B50\u4F1A\u8BDD", onClick: () => void addChildTo(rootId), children: _jsxs("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("path", { d: "M12 8.5v7M8.5 12h7" })] }) }) })] })] }), !collapsed ? (_jsx("div", { style: { paddingBottom: 4 }, children: loading ? (_jsx("div", { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', paddingLeft: 12 }, children: "\u52A0\u8F7D\u4E2D\u2026" })) : (rootChildNodes.map((child) => renderNodeRow(child, 1))) })) : null, workspaceMenuPoint !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(workspaceMenuPoint), items: [
                    { id: 'rename', label: '重命名', icon: _jsx(IconEditOutlineRegular, {}) },
                    { id: 'delete', label: '删除工作区', icon: _jsx(IconTrashOutlineRegular, {}), danger: true },
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
                        setPendingDelete({ workspaceId, title: summary.title ?? '' });
                } })) : null, pendingDelete !== null ? (_jsx(WorkflowConfirmDialog, { title: "\u5220\u9664\u5DE5\u4F5C\u533A", message: `要删除「${pendingDelete.title}」这个 workflow 工作区吗？\n\n· 节点树、状态与会话绑定会被移除（快照会先进回收站，可在 ~/.dsh/dsh-agent-workflow/workflows-trash 找回）\n· 工作区文件夹、会话记录、.workflow 笔记都不会被删`, confirmLabel: "\u5220\u9664", onClose: () => setPendingDelete(null), onConfirm: () => {
                    const target = pendingDelete;
                    setPendingDelete(null);
                    runtime?.requestDeleteWorkspace?.(target.workspaceId);
                } })) : null, pendingAdvanceConfirm !== null ? (_jsx(WorkflowConfirmDialog, { title: "\u8FDB\u5165\u5B9E\u73B0\u4E2D", message: '这个节点的工作手册里还没写「方案」小节，直接进入实现中可能没有执行依据。\n\n· 点「仍进入」直接推进\n· 点「取消」回讨论中继续完善方案', confirmLabel: "\u4ECD\u8FDB\u5165", onClose: () => {
                    const target = pendingAdvanceConfirm;
                    setPendingAdvanceConfirm(null);
                    window.dispatchEvent(new CustomEvent('dsh-agent-workflow:advance-decision', { detail: { requestId: target.requestId, confirmed: false } }));
                }, onConfirm: () => {
                    const target = pendingAdvanceConfirm;
                    setPendingAdvanceConfirm(null);
                    window.dispatchEvent(new CustomEvent('dsh-agent-workflow:advance-decision', { detail: { requestId: target.requestId, confirmed: true } }));
                } })) : null, nodeMenu !== null ? (() => {
                const menuNode = byId.get(nodeMenu.nodeId);
                if (menuNode === undefined)
                    return null;
                const menuSessionId = typeof menuNode.session_id === 'string' && menuNode.session_id !== ''
                    ? menuNode.session_id
                    : null;
                if (menuSessionId === null) {
                    return (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(nodeMenu), items: [{ id: 'child', label: '新建子会话' }], onClose: () => setNodeMenu(null), onSelect: (id) => {
                            if (id === 'child')
                                void addChildTo(menuNode.node_id);
                        } }));
                }
                const menuPinned = pinnedSessionIds.has(menuSessionId);
                const menuArchived = archivedSessionIds.has(menuSessionId);
                // 注意：这里不出现「分叉会话」——workflow 节点会话不允许分叉（会破坏节点与会话的一一对应）。
                const items = menuArchived
                    ? [{ id: 'unarchive', label: '取消归档', icon: _jsx(IconUnarchiveOutlineRegular, {}) }]
                    : [
                        { id: 'pin', label: menuPinned ? '取消置顶' : '置顶会话', icon: _jsx(IconPinOutlineRegular, {}) },
                        { id: 'rename', label: '重命名', icon: _jsx(IconEditOutlineRegular, {}) },
                        { id: 'copy-id', label: '复制 Session ID', icon: _jsx(IconCopyOutlineRegular, {}) },
                        { id: 'archive', label: '归档会话', icon: _jsx(IconArchiveOutlineRegular, {}), separatorBefore: true },
                    ];
                return (_jsx(Menu, { open: true, anchor: null, portal: true, getAnchorRect: () => menuAnchorRect(nodeMenu), items: items, onClose: () => setNodeMenu(null), onSelect: (id) => void runSessionMenuAction(id, menuSessionId, menuNode) }));
            })() : null, nodeDetailNodeId !== null ? (_jsx(WorkflowNodeDetailDialog, { workflowId: summary.id, nodeId: nodeDetailNodeId, onClose: () => setNodeDetailNodeId(null), onOpenSettings: () => {
                    returnToNodeRef.current = nodeDetailNodeId;
                    setSettingsOpen(true);
                } })) : null, settingsOpen ? (_jsx(WorkflowSettingsDialog, { onClose: () => {
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
    const [nodeInfo, setNodeInfo] = useState(null);
    const [advancing, setAdvancing] = useState(false);
    const [checklist, setChecklist] = useState([]);
    const [hasPlan, setHasPlan] = useState(true);
    const [checklistMenu, setChecklistMenu] = useState(null);
    const readChecklist = async (workflowId, nodeId) => {
        try {
            const response = await fetch(`/dsh-agent-workflow/node-checklist?id=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(nodeId)}`);
            const data = await response.json().catch(() => null);
            if (data?.ok === true) {
                const items = Array.isArray(data.checklist) ? data.checklist : [];
                const plan = data.hasPlan !== false;
                setChecklist(items);
                setHasPlan(plan);
                return { checklist: items, hasPlan: plan };
            }
        }
        catch {
            setChecklist([]);
        }
        return { checklist: [], hasPlan: true };
    };
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
    useEffect(() => {
        if (sessionId === '') {
            setNodeInfo(null);
            return undefined;
        }
        let cancelled = false;
        const tick = async () => {
            if (cancelled)
                return;
            const info = await readNode();
            if (info !== null && info.state === 'implementing')
                void readChecklist(info.workflowId, info.nodeId);
            else
                setChecklist([]);
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
    const label = NODE_STATE_LABEL[nodeInfo.state] ?? nodeInfo.state;
    const nextState = NEXT_NODE_STATE[nodeInfo.state] ?? null;
    /**
     * 漂亮的确认框要渲染在侧栏那棵树里（输入区有 transform，fixed 会跑偏），
     * 所以用两个 window 事件做一次请求/应答往返。
     */
    const requestAdvanceConfirm = (workflowId, nodeId) => new Promise((resolve) => {
        const requestId = `advance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const onDecision = (event) => {
            if (event?.detail?.requestId !== requestId)
                return;
            window.removeEventListener('dsh-agent-workflow:advance-decision', onDecision);
            resolve(event.detail.confirmed === true);
        };
        window.addEventListener('dsh-agent-workflow:advance-decision', onDecision);
        window.dispatchEvent(new CustomEvent('dsh-agent-workflow:confirm-advance', {
            detail: { requestId, workflowId, nodeId },
        }));
    });
    /** 推进：写状态 → 刷新徽标 → 把新状态的默认输入填进输入框（不自动发送）。 */
    const advance = async () => {
        if (nextState === null || advancing)
            return;
        // 软提醒：进入实现中之前，如果方案还没写进工作手册，先确认一次（不阻断）。
        if (nextState === 'implementing') {
            const meta = await readChecklist(nodeInfo.workflowId, nodeInfo.nodeId);
            if (!meta.hasPlan) {
                const confirmed = await requestAdvanceConfirm(nodeInfo.workflowId, nodeInfo.nodeId);
                if (!confirmed)
                    return;
            }
        }
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
            if (info !== null && info.state === 'implementing')
                void readChecklist(info.workflowId, info.nodeId);
        }
        catch (error) {
            console.error('[dsh-agent-workflow] 推进状态失败：', error);
        }
        finally {
            setAdvancing(false);
        }
    };
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [_jsxs("button", { type: "button", title: "\u67E5\u770B / \u7F16\u8F91\u672C\u8282\u70B9\u7684\u64CD\u4F5C\u7EC6\u8282", onClick: () => {
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
                }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: '50%', display: 'block', background: NODE_STATE_COLOR[nodeInfo.state] ?? 'transparent' } }), label] }), nodeInfo.state === 'implementing' && checklist.length > 0 ? (() => {
                const doneCount = checklist.filter((item) => item.done).length;
                return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", title: "\u5B9E\u65BD\u8FDB\u5EA6\uFF08AI \u81EA\u52A8\u52FE\u9009\uFF0C\u53EA\u8BFB\uFF09", onClick: (event) => {
                                event.currentTarget.focus({ preventScroll: true });
                                const point = menuPointFromEvent(event);
                                setChecklistMenu((current) => (current === null ? point : null));
                            }, style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 22,
                                padding: '0 8px',
                                borderRadius: 6,
                                border: '1px solid transparent',
                                background: 'var(--dsw-alias-bg-layer-1)',
                                color: doneCount === checklist.length ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-brand-primary)',
                                fontSize: 11,
                                lineHeight: '22px',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                            }, onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'var(--dsw-alias-border-l1)'; }, onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent'; }, children: ["\u5B9E\u65BD ", doneCount, "/", checklist.length] }), checklistMenu !== null ? (_jsx(Menu, { open: true, anchor: null, portal: true, align: "end", getAnchorRect: () => menuAnchorRect(checklistMenu), items: checklist.map((item) => ({ id: item.label, label: `${item.done ? '✓' : '○'}  ${item.label}` })), onClose: () => setChecklistMenu(null), onSelect: () => setChecklistMenu(null) })) : null] }));
            })() : null, nextState === null ? null : (_jsx(Tooltip, { label: `推进到 ${NODE_STATE_LABEL[nextState] ?? nextState}`, side: "top", delayMs: 400, portal: true, children: _jsx("button", { type: "button", "aria-label": "\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5", disabled: advancing, onClick: () => void advance(), style: {
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
                    }, children: _jsxs("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("path", { d: "M5 12h13" }), _jsx("path", { d: "m12.5 6 6 6-6 6" })] }) }) }))] }));
}
/** 把状态徽标挂到输入框工具条的左侧控件区（权限控件的右边）。 */
export function applyWorkflowComposerBadge(ctx) {
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'dsh-agent-workflow.state',
        order: 10,
        label: 'workflow 状态',
    }, WorkflowStateBadge));
}
export const workflowKindPlugin = {
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
        if (itemWorkspaceId !== null && hostWorkspaceId !== null)
            return itemWorkspaceId === hostWorkspaceId;
        const itemPath = typeof item.path === 'string' ? normalizeWorkspacePath(item.path) : '';
        const hostPath = typeof workspace.path === 'string' ? normalizeWorkspacePath(workspace.path) : '';
        return itemPath !== '' && hostPath !== '' && itemPath === hostPath;
    },
    renderItem: (summary, collapsed, onToggle, onChanged, runtime) => (_jsx(WorkflowWorkspaceItem, { summary: summary, collapsed: collapsed, onToggle: onToggle, onChanged: onChanged, runtime: runtime })),
};
//# sourceMappingURL=workflow-embedded.js.map