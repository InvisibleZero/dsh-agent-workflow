import { jsx as _jsx } from "react/jsx-runtime";
// @ts-nocheck
/**
 * 侧栏会话行「行尾常驻状态点」：非悬停时始终显示一个按 workflow 状态着色的小圆点。
 *
 * - 挂在 sidebar.session.row.trailing（常驻图标位，非交互；悬停该行时宿主自动隐藏）。
 * - 数据：第一次挂载时把「所有工作区里已绑定节点的会话状态」整表拉一次（模块内单例 promise），
 *   之后只由状态变化事件按会话更新——不再逐行请求、不再按工作目录缓存 5 秒、不依赖内存名单。
 * - 事件没有 detail 时（旧格式）退回一次全量重取，保证升级路径不会静默失效。
 */
import { useEffect, useState } from 'react';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { NODE_STATE_COLOR } from './node-state-color';
import { WORKFLOW_STATE_CHANGED_EVENT, getSessionState, readStateChangedDetail, replaceSessionStates, setSessionState, subscribeSessionStates, } from './session-state-store';
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
                replaceSessionStates(responseBody.nodes);
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
    const [state, setState] = useState(() => getSessionState(sessionId));
    useEffect(() => {
        if (sessionId === '') {
            setState(null);
            return undefined;
        }
        const sync = () => setState(getSessionState(sessionId));
        sync();
        const unsubscribe = subscribeSessionStates(sync);
        void loadAllSessionStates().then(sync);
        const onChanged = (event) => {
            const detail = readStateChangedDetail(event);
            if (detail !== null) {
                // 单条更新：只动这一行，其他会话不受影响。
                setSessionState(detail.sessionId, detail.state);
                return;
            }
            // 旧格式事件没有 detail：退回全量重取（下次挂载也会重新加载）。
            loadingPromise = null;
            void loadAllSessionStates().then(sync);
        };
        window.addEventListener(WORKFLOW_STATE_CHANGED_EVENT, onChanged);
        return () => {
            unsubscribe();
            window.removeEventListener(WORKFLOW_STATE_CHANGED_EVENT, onChanged);
        };
    }, [sessionId]);
    if (state === null)
        return null;
    const color = NODE_STATE_COLOR[state];
    if (color === undefined)
        return null;
    return (_jsx("span", { "aria-hidden": true, title: NODE_STATE_LABEL[state] ?? state, style: {
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
        } }));
}
/** 把状态点注册到侧栏会话行的行尾常驻图标位。 */
export function applySessionRowStateDots(ctx) {
    ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
        name: 'sidebar.session.row.trailing',
        id: 'dsh-agent-workflow.state-dot',
        order: 10,
        label: 'workflow 状态点',
    }, SessionStateDot));
}
//# sourceMappingURL=session-row-dot.js.map