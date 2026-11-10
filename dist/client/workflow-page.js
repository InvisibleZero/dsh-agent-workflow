import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
/**
 * Workflow 工作区面板（浏览器半）。
 *
 * 形态：居中弹窗（`main[key=agent-workflow]`），入口是左侧导航项。
 * 列表项**就地展开**成嵌套子树：父节点 → 子节点 → 更深的子节点，逐级开合，
 * 不跳转页面。每个节点可以就地加子节点（宿主 /add-node）。
 *
 * 数据是一份全局列表（宿主半 /dsh-agent-workflow/list|create|get|add-node）。
 */
import { useCallback, useEffect, useState } from 'react';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
const VEIL_STYLE = {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    boxSizing: 'border-box',
    background: 'rgba(0, 0, 0, 0.32)',
    color: 'inherit',
};
const DIALOG_STYLE = {
    width: 520,
    maxWidth: '100%',
    maxHeight: '80vh',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'var(--dsw-alias-bg-layer-1, #1b1b1b)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
    overflow: 'auto',
};
const HEADER_STYLE = { display: 'flex', alignItems: 'center', gap: 6 };
const TITLE_STYLE = {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'var(--dsw-alias-label-primary, inherit)',
};
const MUTED_STYLE = {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--dsw-alias-label-secondary, inherit)',
};
const TINY_STYLE = { fontSize: 11, color: 'var(--dsw-alias-label-secondary, inherit)' };
const ERROR_STYLE = { ...MUTED_STYLE, color: 'var(--dsw-alias-state-error-primary, #c62828)' };
const SUCCESS_STYLE = { ...MUTED_STYLE, color: 'var(--dsw-alias-state-success-primary, #2e7d32)' };
const BUTTON_STYLE = {
    height: 26,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary, inherit)',
    font: 'inherit',
    fontSize: 12,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
};
const ICON_BUTTON_STYLE = { ...BUTTON_STYLE, width: 26, padding: 0, border: 'none' };
const FIELD_STYLE = {
    boxSizing: 'border-box',
    width: '100%',
    height: 28,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'var(--dsw-alias-bg-base, transparent)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
};
const ITEM_BASE = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
};
function describeError(error) {
    if (error instanceof Error && error.message !== '')
        return error.message;
    return String(error);
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
async function apiGet(path) {
    const response = await fetch(path, { cache: 'no-store' });
    const json = await response.json().catch(() => null);
    if (!response.ok || json === null || json.ok !== true)
        throw new Error(json?.error ?? `HTTP ${response.status}`);
    return json;
}
async function apiPost(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json === null || json.ok !== true)
        throw new Error(json?.error ?? `HTTP ${response.status}`);
    return json;
}
/** 左侧导航项图标：外框与文字由宿主负责，这里只画图形。 */
export function WorkflowPanelIcon(props) {
    const size = props.size ?? 16;
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block', opacity: props.active ? 1 : 0.75 }, children: [_jsx("circle", { cx: "6", cy: "6", r: "2.6" }), _jsx("circle", { cx: "18", cy: "12", r: "2.6" }), _jsx("circle", { cx: "6", cy: "18", r: "2.6" }), _jsx("path", { d: "M8.4 7.3 15.6 11M8.4 16.7 15.6 13" })] }));
}
/** 树上的一个节点：自己可开合、可就地加子节点；子节点递归渲染。 */
function TreeNode(props) {
    const { node, byId, onAddNode, depth } = props;
    const [open, setOpen] = useState(true);
    const [drafting, setDrafting] = useState(false);
    const [draft, setDraft] = useState('');
    const children = node.child_ids.map((id) => byId.get(id)).filter((child) => child !== undefined);
    const submit = () => {
        const title = draft.trim();
        if (title === '')
            return;
        onAddNode(node.node_id, title);
        setDraft('');
        setDrafting(false);
        setOpen(true);
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 2 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth * 14 }, children: [_jsx("button", { type: "button", style: { ...ICON_BUTTON_STYLE, width: 18, height: 20, fontSize: 11, opacity: children.length === 0 ? 0.35 : 1 }, onClick: () => setOpen((value) => !value), disabled: children.length === 0, "aria-label": open ? '收起' : '展开', children: children.length === 0 ? '·' : open ? '▾' : '▸' }), _jsx("span", { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-primary, inherit)' }, children: node.title ?? node.node_type }), _jsx("span", { style: TINY_STYLE, children: NODE_STATE_LABEL[node.current_state] ?? node.current_state }), _jsx("button", { type: "button", style: { ...ICON_BUTTON_STYLE, width: 18, height: 20, fontSize: 11 }, title: "\u52A0\u5B50\u8282\u70B9", "aria-label": "\u52A0\u5B50\u8282\u70B9", onClick: () => setDrafting(true), children: "\uFF0B" })] }), drafting ? (_jsx("div", { style: { display: 'flex', gap: 6, paddingLeft: (depth + 1) * 14 }, children: _jsx("input", { autoFocus: true, value: draft, placeholder: "\u5B50\u8282\u70B9\u540D\u79F0\uFF0C\u56DE\u8F66\u521B\u5EFA", style: FIELD_STYLE, onChange: (event) => setDraft(event.target.value), onKeyDown: (event) => {
                        if (event.key === 'Enter')
                            submit();
                        if (event.key === 'Escape')
                            setDrafting(false);
                    }, onBlur: () => setDrafting(false) }) })) : null, open
                ? children.map((child) => (_jsx(TreeNode, { node: child, byId: byId, onAddNode: onAddNode, depth: depth + 1 }, child.node_id)))
                : null] }));
}
export function WorkflowPage(props) {
    const [items, setItems] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [rootDrafting, setRootDrafting] = useState(false);
    const [rootDraft, setRootDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const refresh = useCallback(async () => {
        try {
            const json = await apiGet('/dsh-agent-workflow/list');
            setItems(json.items ?? []);
        }
        catch (e) {
            setError(describeError(e));
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const close = useCallback(() => {
        const layout = getService(props.ctx, 'layout');
        try {
            layout?.selectPanel?.('conversation');
        }
        catch (error_) {
            console.error('[dsh-agent-workflow] 关闭弹窗时切面板失败：', error_);
        }
    }, [props.ctx]);
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            // 先收起展开的树，再关弹窗，避免一按就把整个面板关掉。
            if (expandedId !== null) {
                setExpandedId(null);
                setSnapshot(null);
                return;
            }
            event.preventDefault();
            close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close, expandedId]);
    const loadSnapshot = useCallback(async (id) => {
        const json = await apiGet(`/dsh-agent-workflow/get?id=${encodeURIComponent(id)}`);
        setSnapshot(json.snapshot);
    }, []);
    const toggleExpand = async (item) => {
        setError(null);
        if (expandedId === item.id) {
            setExpandedId(null);
            setSnapshot(null);
            return;
        }
        setExpandedId(item.id);
        setSnapshot(null);
        try {
            await loadSnapshot(item.id);
        }
        catch (e) {
            setError(describeError(e));
        }
    };
    const addNode = async (parentId, title) => {
        if (expandedId === null)
            return;
        setError(null);
        try {
            const json = await apiPost('/dsh-agent-workflow/add-node', { id: expandedId, parentId, title });
            setSnapshot(json.snapshot);
        }
        catch (e) {
            setError(describeError(e));
        }
    };
    const create = async () => {
        if (busy)
            return;
        const picker = getService(props.ctx, 'uiWorkspace');
        if (typeof picker?.pickDirectory !== 'function') {
            setError('宿主没有目录选择服务，暂时无法新建。');
            return;
        }
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            try {
                window.focus();
            }
            catch {
                // 某些环境 window.focus 不存在，忽略
            }
            const path = await picker.pickDirectory();
            if (typeof path !== 'string' || path === '')
                return; // 取消：静默
            const created = await apiPost('/dsh-agent-workflow/create', { path });
            await refresh();
            setNotice(`已新建「${created.workspace?.title ?? '工作区'}」。`);
            if (typeof created.workspace?.id === 'string') {
                setExpandedId(created.workspace.id);
                await loadSnapshot(created.workspace.id);
            }
        }
        catch (e) {
            setError(describeError(e));
        }
        finally {
            setBusy(false);
        }
    };
    const keyword = query.trim().toLowerCase();
    const visibleItems = keyword === ''
        ? items
        : items.filter((item) => item.title.toLowerCase().includes(keyword) || (item.path ?? '').toLowerCase().includes(keyword));
    const rootNode = snapshot === null ? undefined : snapshot.nodes.find((node) => node.node_id === snapshot.workspace_id);
    const byId = new Map((snapshot?.nodes ?? []).map((node) => [node.node_id, node]));
    return (_jsx("div", { style: VEIL_STYLE, onClick: (event) => {
            if (event.target === event.currentTarget)
                close();
        }, children: _jsxs("div", { style: DIALOG_STYLE, role: "dialog", "aria-modal": "true", "aria-label": "Workflow \u5DE5\u4F5C\u533A", children: [_jsxs("div", { style: HEADER_STYLE, children: [_jsx("strong", { style: TITLE_STYLE, children: "Workflow \u5DE5\u4F5C\u533A" }), _jsx("button", { type: "button", style: ICON_BUTTON_STYLE, title: "\u641C\u7D22", "aria-label": "\u641C\u7D22", "aria-pressed": searchOpen, onClick: () => {
                                setSearchOpen((value) => !value);
                                if (searchOpen)
                                    setQuery('');
                            }, children: _jsxs("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("circle", { cx: "11", cy: "11", r: "6.5" }), _jsx("path", { d: "m16 16 4.5 4.5" })] }) }), _jsx("button", { type: "button", style: ICON_BUTTON_STYLE, title: "\u65B0\u5EFA workflow \u5DE5\u4F5C\u533A", "aria-label": "\u65B0\u5EFA", onClick: create, disabled: busy, children: busy ? '…' : (_jsx("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true, style: { display: 'block' }, children: _jsx("path", { d: "M12 5v14M5 12h14" }) })) }), _jsx("button", { type: "button", style: ICON_BUTTON_STYLE, title: "\u5173\u95ED", "aria-label": "\u5173\u95ED", onClick: close, children: "\u00D7" })] }), searchOpen ? (_jsx("input", { autoFocus: true, value: query, placeholder: "\u641C\u7D22 workflow \u5DE5\u4F5C\u533A", onChange: (event) => setQuery(event.target.value), style: FIELD_STYLE })) : null, error === null ? null : _jsx("p", { role: "status", style: ERROR_STYLE, children: error }), notice === null ? null : _jsx("p", { role: "status", style: SUCCESS_STYLE, children: notice }), visibleItems.length === 0 ? (_jsx("p", { style: MUTED_STYLE, children: items.length === 0 ? '还没有 workflow 工作区。点右上角「＋」，选一个文件夹开始。' : '没有匹配的 workflow 工作区。' })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: visibleItems.map((item) => {
                        const isOpen = expandedId === item.id;
                        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("button", { type: "button", style: { ...ICON_BUTTON_STYLE, width: 18 }, onClick: () => void toggleExpand(item), "aria-label": isOpen ? '收起' : '展开', children: isOpen ? '▾' : '▸' }), _jsxs("button", { type: "button", style: ITEM_BASE, onClick: () => void toggleExpand(item), title: item.path ?? '', children: [_jsx("span", { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-primary, inherit)' }, children: item.title }), _jsx("span", { style: { ...TINY_STYLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: item.path ?? '（无目录）' })] }), _jsx("button", { type: "button", style: { ...ICON_BUTTON_STYLE, width: 20 }, title: "\u52A0\u4E00\u7EA7\u5B50\u8282\u70B9", "aria-label": "\u52A0\u4E00\u7EA7\u5B50\u8282\u70B9", onClick: () => {
                                                void (async () => {
                                                    if (!isOpen)
                                                        await toggleExpand(item);
                                                    setRootDrafting(true);
                                                })();
                                            }, children: "\uFF0B" })] }), isOpen ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 22 }, children: [rootDrafting && rootNode !== undefined ? (_jsx("div", { style: { display: 'flex', gap: 6 }, children: _jsx("input", { autoFocus: true, value: rootDraft, placeholder: "\u5B50\u8282\u70B9\u540D\u79F0\uFF0C\u56DE\u8F66\u521B\u5EFA", style: FIELD_STYLE, onChange: (event) => setRootDraft(event.target.value), onKeyDown: (event) => {
                                                    if (event.key === 'Enter' && rootDraft.trim() !== '') {
                                                        void addNode(rootNode.node_id, rootDraft);
                                                        setRootDraft('');
                                                        setRootDrafting(false);
                                                    }
                                                    if (event.key === 'Escape')
                                                        setRootDrafting(false);
                                                }, onBlur: () => setRootDrafting(false) }) })) : null, snapshot === null ? (_jsx("span", { style: TINY_STYLE, children: "\u8BFB\u53D6\u4E2D\u2026" })) : rootNode === undefined ? (_jsx("span", { style: TINY_STYLE, children: "\u5FEB\u7167\u91CC\u6CA1\u6709\u6839\u8282\u70B9\u3002" })) : rootNode.child_ids.length === 0 ? (_jsx("span", { style: TINY_STYLE, children: "\u8FD8\u6CA1\u6709\u5B50\u8282\u70B9\uFF0C\u70B9\u53F3\u4FA7\u300C\uFF0B\u300D\u52A0\u4E00\u4E2A\u3002" })) : (rootNode.child_ids.map((childId) => {
                                            const child = byId.get(childId);
                                            if (child === undefined)
                                                return null;
                                            return (_jsx(TreeNode, { node: child, byId: byId, onAddNode: (parentId, title) => void addNode(parentId, title), depth: 0 }, childId));
                                        }))] })) : null] }, item.id));
                    }) }))] }) }));
}
//# sourceMappingURL=workflow-page.js.map