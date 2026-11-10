import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
/**
 * Workflow 工作区的入口与面板（浏览器半）。
 *
 * 入口 = 侧栏底部 `sidebar.footer.action` 的一个「Workflow」按钮；
 * 点开 = 居中弹窗，里面是**我们自己的 workflow 列表**（不是 dsh 的目录工作区）。
 * 数据走宿主半的 `/dsh-agent-workflow/list|create|get` 三个本机路由。
 *
 * 与 dsh workspace 完全解耦：这里只读写 WorkflowSnapshot，不碰 workspaces.create。
 */
import { useCallback, useEffect, useState } from 'react';
import { WorkflowTree } from './workflow-tree';
const BACKDROP_STYLE = {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'rgba(0, 0, 0, 0.35)',
};
const DIALOG_STYLE = {
    width: 460,
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
const HEADER_STYLE = { display: 'flex', alignItems: 'center', gap: 8 };
const TITLE_STYLE = {
    flex: 1,
    fontSize: 15,
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
const ERROR_STYLE = {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--dsw-alias-state-error-primary, #c62828)',
};
const SUCCESS_STYLE = {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    color: 'var(--dsw-alias-state-success-primary, #2e7d32)',
};
const BUTTON_STYLE = {
    height: 30,
    padding: '0 12px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary, inherit)',
    font: 'inherit',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
};
const PRIMARY_BUTTON_STYLE = {
    ...BUTTON_STYLE,
    border: '1px solid var(--dsw-alias-brand-primary, #4c7dff)',
    color: 'var(--dsw-alias-brand-primary, #4c7dff)',
    fontWeight: 600,
};
const ICON_BUTTON_STYLE = {
    ...BUTTON_STYLE,
    height: 24,
    width: 24,
    padding: 0,
    border: 'none',
    fontSize: 16,
    color: 'var(--dsw-alias-label-secondary, inherit)',
};
const LIST_STYLE = { display: 'flex', flexDirection: 'column', gap: 6 };
const ITEM_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
};
const ITEM_HOVER_STYLE = { ...ITEM_STYLE, border: '1px solid var(--dsw-alias-border-l1, #ddd)', background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.04))' };
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
    if (!response.ok || json === null || json.ok !== true) {
        throw new Error(json?.error ?? `HTTP ${response.status}`);
    }
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
    if (!response.ok || json === null || json.ok !== true) {
        throw new Error(json?.error ?? `HTTP ${response.status}`);
    }
    return json;
}
function WorkflowListModal(props) {
    const [items, setItems] = useState([]);
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const refresh = useCallback(async () => {
        setError(null);
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
    const openDetail = async (item) => {
        setError(null);
        try {
            const json = await apiGet(`/dsh-agent-workflow/get?id=${encodeURIComponent(item.id)}`);
            setDetail(json.snapshot);
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
            await apiPost('/dsh-agent-workflow/create', { path });
            await refresh();
            setNotice('已新建 workflow 工作区（标题用文件夹名）。');
        }
        catch (e) {
            setError(describeError(e));
        }
        finally {
            setBusy(false);
        }
    };
    const onKeyDown = useCallback((event) => {
        if (event.key === 'Escape')
            props.onClose();
    }, [props.onClose]);
    useEffect(() => {
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);
    return (_jsx("div", { style: BACKDROP_STYLE, onClick: (event) => {
            if (event.target === event.currentTarget)
                props.onClose();
        }, children: _jsxs("div", { style: DIALOG_STYLE, role: "dialog", "aria-modal": "true", "aria-label": "Workflow \u5DE5\u4F5C\u533A", children: [_jsxs("div", { style: HEADER_STYLE, children: [_jsx("strong", { style: TITLE_STYLE, children: detail ? detail.title : 'Workflow 工作区' }), detail ? null : (_jsx("button", { type: "button", style: PRIMARY_BUTTON_STYLE, onClick: create, disabled: busy, children: busy ? '新建中…' : '＋ 新建' })), _jsx("button", { type: "button", style: ICON_BUTTON_STYLE, title: "\u5173\u95ED", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\u00D7" })] }), error === null ? null : _jsx("p", { role: "status", style: ERROR_STYLE, children: error }), notice === null ? null : _jsx("p", { role: "status", style: SUCCESS_STYLE, children: notice }), detail ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx("p", { style: MUTED_STYLE, children: detail.working_directory ?? detail.path ?? '' }), _jsx("button", { type: "button", style: BUTTON_STYLE, onClick: () => setDetail(null), children: "\u2190 \u8FD4\u56DE\u5217\u8868" }), _jsx(WorkflowTree, { nodes: detail.nodes, rootId: detail.workspace_id, onRequestTransition: () => { }, onEditChildDetail: () => { } })] })) : items.length === 0 ? (_jsx("p", { style: MUTED_STYLE, children: "\u8FD8\u6CA1\u6709 workflow \u5DE5\u4F5C\u533A\u3002\u70B9\u53F3\u4E0A\u89D2\u300C\uFF0B \u65B0\u5EFA\u300D\uFF0C\u9009\u4E00\u4E2A\u6587\u4EF6\u5939\u5F00\u59CB\u3002" })) : (_jsx("div", { style: LIST_STYLE, children: items.map((item) => (_jsxs("button", { type: "button", style: ITEM_STYLE, onClick: () => void openDetail(item), children: [_jsx("span", { style: TITLE_STYLE, children: item.title }), _jsx("span", { style: MUTED_STYLE, children: item.path ?? '（无目录）' })] }, item.id))) }))] }) }));
}
/** 侧栏底部入口：宽栏显示文字，窄栏只显示图标。 */
export function WorkflowFooterButton(props) {
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", title: "Workflow \u5DE5\u4F5C\u533A", onClick: () => setOpen((value) => !value), style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    width: '100%',
                }, children: [_jsx("span", { "aria-hidden": true, children: "\u25A4" }), props.wide ? _jsx("span", { children: "Workflow" }) : null] }), open ? _jsx(WorkflowListModal, { ctx: props.ctx, onClose: () => setOpen(false) }) : null] }));
}
//# sourceMappingURL=workflow-list-panel.js.map