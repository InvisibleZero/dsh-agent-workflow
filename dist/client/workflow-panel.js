import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
/**
 * Workflow 的主面板：一个居中弹窗（不是贴在左上角的表单卡片）。
 *
 * 流程（没有任何假控件）：
 *   点「创建」→ 弹宿主原生目录选择（`uiWorkspace.pickDirectory`）
 *   → 选好直接把该目录注册成工作区（`workspaces.create`）→ 名称非空再改名
 *   → 切成 success 面（明确显示"已创建 + 路径"），不再回到空白表单。
 *
 * 槽位关系（改之前先看这里）：
 * - `sidebar.panellist` 每一项就是「一个主面板的图标」，id 与 `main` 的 key 一一对应；
 *   宿主自己画按钮、自己管选中态，所以这里只交一个图标组件。
 * - 点图标＝切到 key 同名的主面板，所以必须同时占住 `main` 的同一个 key。
 *
 * 样式一律走宿主主题 token，不写死 #fff / #ddd。
 */
import { useEffect, useReducer, useRef } from 'react';
import { INITIAL_WORKFLOW_PANEL_STATE, isWorkflowPanelBusy, reduceWorkflowPanel, } from './workflow-panel-state';
/** 弹窗背后的遮罩：铺满主面板区域，卡片居中。 */
const VEIL_STYLE = {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'rgba(0, 0, 0, 0.32)',
    color: 'inherit',
};
const DIALOG_STYLE = {
    width: 420,
    maxWidth: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 18,
    borderRadius: 12,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'var(--dsw-alias-bg-layer-1, #1b1b1b)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
};
const HEADER_STYLE = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
};
const TITLE_STYLE = {
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
const PATH_STYLE = {
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    wordBreak: 'break-all',
    color: 'var(--dsw-alias-label-secondary, inherit)',
};
const FIELD_GROUP_STYLE = { display: 'flex', flexDirection: 'column', gap: 6 };
const FIELD_STYLE = {
    boxSizing: 'border-box',
    width: '100%',
    height: 32,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'var(--dsw-alias-bg-base, transparent)',
    color: 'inherit',
    font: 'inherit',
};
const ROW_STYLE = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const BUTTON_BASE = {
    height: 32,
    padding: '0 14px',
    borderRadius: 6,
    font: 'inherit',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
};
const BUTTON_STYLE = {
    ...BUTTON_BASE,
    border: '1px solid var(--dsw-alias-border-l1, #ddd)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary, inherit)',
};
/** 主按钮：只用品牌色描边 + 文字，不猜背景色，深浅主题都不会翻车。 */
const PRIMARY_BUTTON_STYLE = {
    ...BUTTON_BASE,
    border: '1px solid var(--dsw-alias-brand-primary, #4c7dff)',
    background: 'transparent',
    color: 'var(--dsw-alias-brand-primary, #4c7dff)',
    fontWeight: 600,
};
const DISABLED_BUTTON_STYLE = { ...BUTTON_STYLE, opacity: 0.5, cursor: 'not-allowed' };
const DISABLED_PRIMARY_BUTTON_STYLE = { ...PRIMARY_BUTTON_STYLE, opacity: 0.5, cursor: 'not-allowed' };
const ICON_BUTTON_STYLE = {
    ...BUTTON_BASE,
    height: 24,
    padding: '0 8px',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, inherit)',
    fontSize: 16,
    lineHeight: 1,
};
const NOTICE_STYLES = {
    success: { fontSize: 12, lineHeight: 1.5, margin: 0, color: 'var(--dsw-alias-state-success-primary, #2e7d32)' },
    error: { fontSize: 12, lineHeight: 1.5, margin: 0, color: 'var(--dsw-alias-state-error-primary, #c62828)' },
};
function describeError(error) {
    if (error instanceof Error && error.message !== '')
        return error.message;
    return String(error);
}
/** 取服务：优先 `ctx.get`（拿不到返回 undefined），再退回属性访问；两条路都兜住异常。 */
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
            // 未声明的服务在 cordis 里可能直接抛，继续走属性访问
        }
    }
    try {
        return ctx[name];
    }
    catch {
        return undefined;
    }
}
export function WorkflowPanel(props) {
    const [state, dispatch] = useReducer(reduceWorkflowPanel, INITIAL_WORKFLOW_PANEL_STATE);
    const busy = isWorkflowPanelBusy(state);
    // disabled 要等下一次渲染才生效，双击的空窗期靠这个 ref 拦住，
    // 否则会连开两个原生目录对话框。
    const inFlight = useRef(false);
    const leave = () => {
        // 关掉后回会话列（宿主的 layout 服务）。切走了就用「干净表单」收尾，
        // 这样下次点图标回来一定是一张新表；切不走才停在 closed 面（有「重新打开」兜底）。
        const layout = getService(props.ctx, 'layout');
        let switched = false;
        try {
            if (typeof layout?.selectPanel === 'function') {
                layout.selectPanel('conversation');
                switched = true;
            }
        }
        catch {
            switched = false;
        }
        dispatch({ kind: switched ? 'reopen' : 'close' });
    };
    useEffect(() => {
        if (state.view === 'closed')
            return undefined;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape' || inFlight.current)
                return;
            event.preventDefault();
            leave();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [state.view]);
    const submit = async () => {
        if (inFlight.current || busy)
            return;
        inFlight.current = true;
        try {
            await runCreate();
        }
        finally {
            inFlight.current = false;
        }
    };
    async function runCreate() {
        const typedName = state.name.trim();
        dispatch({ kind: 'submit' });
        const picker = getService(props.ctx, 'uiWorkspace');
        const workspaces = getService(props.ctx, 'workspaces');
        if (typeof picker?.pickDirectory !== 'function' || typeof workspaces?.create !== 'function') {
            dispatch({ kind: 'failed', message: '宿主没有提供目录选择与工作区服务，暂时无法创建工作区。' });
            return;
        }
        let path = null;
        try {
            // 宿主弹的是原生对话框；窗口不在前台时它可能被压在后面，先尽力把窗口带到前台。
            // 真正的修法在宿主侧（把对话框挂到主窗口），客户端只能做这一步。
            try {
                window.focus();
            }
            catch {
                // 某些环境 window.focus 不存在，忽略
            }
            path = await picker.pickDirectory();
        }
        catch (error) {
            dispatch({ kind: 'failed', message: `选择目录失败：${describeError(error)}` });
            return;
        }
        // 用户在原生对话框里点了取消：不是错误，静默回到可编辑状态。
        if (typeof path !== 'string' || path === '') {
            dispatch({ kind: 'pick-cancelled' });
            return;
        }
        dispatch({ kind: 'picked' });
        try {
            const created = await workspaces.create({ path });
            let title = created.title;
            let renameFailed = false;
            if (typedName !== '' && typedName !== title) {
                try {
                    title = (await workspaces.rename(created.workspaceId, typedName)).title;
                }
                catch {
                    // 工作区已经建出来了，改名失败不该让整体判失败，只在提示里说明。
                    renameFailed = true;
                }
            }
            dispatch({ kind: 'created', title, path: created.path, renameFailed });
        }
        catch (error) {
            dispatch({ kind: 'failed', message: `创建工作区失败：${describeError(error)}` });
        }
    }
    if (state.view === 'closed') {
        return (_jsx("div", { style: { ...VEIL_STYLE, background: 'transparent' }, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }, children: [_jsx("p", { style: MUTED_STYLE, children: "\u5F39\u7A97\u5DF2\u5173\u95ED\u3002" }), _jsx("button", { type: "button", style: BUTTON_STYLE, onClick: () => dispatch({ kind: 'reopen' }), children: "\u91CD\u65B0\u6253\u5F00" })] }) }));
    }
    const isSuccess = state.view === 'success';
    return (_jsx("div", { style: VEIL_STYLE, children: _jsxs("div", { style: DIALOG_STYLE, role: "dialog", "aria-modal": "true", "aria-label": "\u65B0\u5EFA Workflow \u5DE5\u4F5C\u533A", children: [_jsxs("div", { style: HEADER_STYLE, children: [_jsx("strong", { style: TITLE_STYLE, children: isSuccess ? 'Workflow 工作区已就绪' : '新建 Workflow 工作区' }), _jsx("button", { type: "button", style: ICON_BUTTON_STYLE, title: "\u5173\u95ED", onClick: leave, "aria-label": "\u5173\u95ED", children: "\u00D7" })] }), isSuccess ? (_jsxs(_Fragment, { children: [_jsx("p", { style: NOTICE_STYLES.success, children: state.notice?.text }), _jsx("p", { style: PATH_STYLE, children: state.created?.path }), _jsx("p", { style: MUTED_STYLE, children: "\u5B83\u5DF2\u7ECF\u51FA\u73B0\u5728\u5DE6\u4FA7\u300C\u5DE5\u4F5C\u533A\u300D\u5217\u8868\u91CC\u3002" }), _jsxs("div", { style: ROW_STYLE, children: [_jsx("button", { type: "button", style: BUTTON_STYLE, onClick: () => dispatch({ kind: 'reopen' }), children: "\u518D\u5EFA\u4E00\u4E2A" }), _jsx("button", { type: "button", style: PRIMARY_BUTTON_STYLE, onClick: leave, children: "\u5B8C\u6210" })] })] })) : (_jsxs("form", { style: { display: 'flex', flexDirection: 'column', gap: 14 }, onSubmit: (event) => {
                        event.preventDefault();
                        void submit();
                    }, children: [_jsx("p", { style: MUTED_STYLE, children: "\u70B9\u300C\u521B\u5EFA\u300D\u5148\u9009\u6587\u4EF6\u5939\uFF0C\u9009\u597D\u5C31\u76F4\u63A5\u5EFA\u6210\u5DE5\u4F5C\u533A\uFF08\u51FA\u73B0\u5728\u5DE6\u4FA7\u300C\u5DE5\u4F5C\u533A\u300D\u5217\u8868\u91CC\uFF09\u3002" }), _jsxs("label", { style: FIELD_GROUP_STYLE, children: [_jsx("span", { style: MUTED_STYLE, children: "\u5DE5\u4F5C\u533A\u540D\u79F0\uFF08\u53EF\u7559\u7A7A\uFF0C\u9ED8\u8BA4\u7528\u6587\u4EF6\u5939\u540D\uFF09" }), _jsx("input", { style: { ...FIELD_STYLE, opacity: busy ? 0.6 : 1 }, value: state.name, autoFocus: true, disabled: busy, placeholder: "\u4F8B\u5982\uFF1A\u63D2\u4EF6\u542F\u52A8\u62A5\u9519\u590D\u76D8", onChange: (event) => dispatch({ kind: 'name-changed', name: event.target.value }) })] }), state.notice === null ? null : (_jsx("p", { role: "status", style: NOTICE_STYLES[state.notice.tone], children: state.notice.text })), _jsxs("div", { style: ROW_STYLE, children: [_jsx("button", { type: "button", style: busy ? DISABLED_BUTTON_STYLE : BUTTON_STYLE, disabled: busy, onClick: leave, children: "\u53D6\u6D88" }), _jsx("button", { type: "submit", style: busy ? DISABLED_PRIMARY_BUTTON_STYLE : PRIMARY_BUTTON_STYLE, disabled: busy, children: state.phase === 'picking' ? '选择中…' : state.phase === 'creating' ? '创建中…' : '创建' })] })] }))] }) }));
}
//# sourceMappingURL=workflow-panel.js.map