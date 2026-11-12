"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySessionRowStateDots = applySessionRowStateDots;
const jsx_runtime_1 = require("react/jsx-runtime");
// @ts-nocheck
/**
 * 侧栏会话行「行尾常驻状态点」：非悬停时始终显示一个按 workflow 状态着色的小圆点。
 *
 * - 挂在 sidebar.session.row.trailing（常驻图标位，非交互；悬停该行时宿主自动隐藏）。
 * - 数据：第一次挂载时把「所有工作区里已绑定节点的会话状态」整表拉一次（模块内单例 promise），
 *   之后只由状态变化事件按会话更新——不再逐行请求、不再按工作目录缓存 5 秒、不依赖内存名单。
 * - 事件没有 detail 时（旧格式）退回一次全量重取，保证升级路径不会静默失效。
 */
const react_1 = require("react");
const node_state_label_1 = require("../schema/node-state-label");
const node_state_color_1 = require("./node-state-color");
const session_state_store_1 = require("./session-state-store");
/** 全量加载只跑一次；失败时清掉，下一次挂载还能重试。 */
let loadingPromise = null;
function loadAllSessionStates() {
    if (loadingPromise !== null)
        return loadingPromise;
    loadingPromise = (async () => {
        try {
            const response = await fetch('/dsh-agent-workflow/sidebar-nodes');
            const responseBody = await response.json().catch(() => null);
            if (responseBody?.ok === true && typeof responseBody.nodes === 'object' && responseBody.nodes !== null) {
                (0, session_state_store_1.replaceSessionStates)(responseBody.nodes);
                return;
            }
            // 埋点：接口回了但不是成功结构，必须留痕，否则「一个点都没有」分不清是没数据还是加载失败。
            console.warn(`[dsh-agent-workflow] 侧栏状态全量加载返回异常（HTTP ${response.status}）：`, responseBody?.error ?? responseBody);
        }
        catch (error) {
            // 网络/接口暂时不可用：不缓存失败，下一次挂载重试。
            console.warn('[dsh-agent-workflow] 侧栏状态全量加载失败（下次挂载会重试）：', error);
        }
        loadingPromise = null;
    })();
    return loadingPromise;
}
function SessionStateDot(props) {
    const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
    const [state, setState] = (0, react_1.useState)(() => (0, session_state_store_1.getSessionState)(sessionId));
    (0, react_1.useEffect)(() => {
        if (sessionId === '') {
            setState(null);
            return undefined;
        }
        const sync = () => setState((0, session_state_store_1.getSessionState)(sessionId));
        sync();
        const unsubscribe = (0, session_state_store_1.subscribeSessionStates)(sync);
        void loadAllSessionStates().then(sync);
        const onChanged = (event) => {
            const detail = (0, session_state_store_1.readStateChangedDetail)(event);
            if (detail !== null) {
                // 单条更新：只动这一行，其他会话不受影响。
                (0, session_state_store_1.setSessionState)(detail.sessionId, detail.state);
                return;
            }
            // 旧格式事件没有 detail：退回全量重取（下次挂载也会重新加载）。
            loadingPromise = null;
            void loadAllSessionStates().then(sync);
        };
        window.addEventListener(session_state_store_1.WORKFLOW_STATE_CHANGED_EVENT, onChanged);
        return () => {
            unsubscribe();
            window.removeEventListener(session_state_store_1.WORKFLOW_STATE_CHANGED_EVENT, onChanged);
        };
    }, [sessionId]);
    if (state === null)
        return null;
    const color = node_state_color_1.NODE_STATE_COLOR[state];
    if (color === undefined)
        return null;
    return ((0, jsx_runtime_1.jsx)("span", { "aria-hidden": true, title: node_state_label_1.NODE_STATE_LABEL[state] ?? state, style: {
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
        } }));
}
/** 把状态点注册到侧栏会话行的行尾常驻图标位。 */
function applySessionRowStateDots(ctx) {
    ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
        name: 'sidebar.session.row.trailing',
        id: 'dsh-agent-workflow.state-dot',
        order: 10,
        label: 'workflow 状态点',
    }, SessionStateDot));
}
//# sourceMappingURL=session-row-dot.js.map