"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySessionRowStateDots = applySessionRowStateDots;
const jsx_runtime_1 = require("react/jsx-runtime");
// @ts-nocheck
/**
 * 侧栏会话行「行尾常驻状态点」：非悬停时始终显示一个按 workflow 状态着色的小圆点。
 *
 * - 挂在 sidebar.session.row.trailing（常驻图标位，非交互；悬停该行时宿主自动隐藏）。
 * - 数据走批量接口 /sidebar-nodes?path=…，一次拿整个工作区的节点状态，模块内 promise 缓存去重，
 *   5 秒 TTL；状态机推进后由 badge 派发 window 事件 `dsh-workflow-state-changed` 触发刷新。
 */
const react_1 = require("react");
const node_state_label_1 = require("../schema/node-state-label");
const node_state_color_1 = require("./node-state-color");
const CACHE_TTL_MS = 5000;
const promiseCache = new Map();
function getWorkspaceStates(path) {
    const cached = promiseCache.get(path);
    if (cached !== undefined)
        return cached;
    const promise = (async () => {
        try {
            const response = await fetch(`/dsh-agent-workflow/sidebar-nodes?path=${encodeURIComponent(path)}`);
            const responseBody = await response.json().catch(() => null);
            if (responseBody?.ok === true && typeof responseBody.nodes === 'object' && responseBody.nodes !== null) {
                return responseBody.nodes;
            }
            return {};
        }
        catch {
            return {};
        }
    })();
    promiseCache.set(path, promise);
    window.setTimeout(() => {
        if (promiseCache.get(path) === promise)
            promiseCache.delete(path);
    }, CACHE_TTL_MS);
    return promise;
}
function SessionStateDot(props) {
    const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
    const cwd = typeof props?.useSessions === 'function'
        ? props.useSessions((s) => (s?.byId?.[sessionId]?.cwd ?? ''))
        : '';
    const [state, setState] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        if (sessionId === '' || cwd === '') {
            setState(null);
            return undefined;
        }
        let cancelled = false;
        const load = () => {
            void getWorkspaceStates(cwd).then((map) => {
                if (!cancelled)
                    setState(map[sessionId] ?? null);
            });
        };
        load();
        const onChanged = () => {
            promiseCache.clear();
            load();
        };
        window.addEventListener('dsh-workflow-state-changed', onChanged);
        return () => {
            cancelled = true;
            window.removeEventListener('dsh-workflow-state-changed', onChanged);
        };
    }, [sessionId, cwd]);
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