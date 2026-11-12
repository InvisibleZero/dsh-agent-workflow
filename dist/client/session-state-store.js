/**
 * 侧栏会话状态表（客户端共享单例）。
 *
 * 为什么单独成模块：状态点要能在「一次全量加载」和「单条状态变化」两种入口下更新，
 * 但这两条路径不该各自维护一份数据。这里只做内存表 + 订阅，不碰 DOM、不发请求，
 * 组件和同步逻辑都只是它的使用方。
 */
/** 状态变化事件名：推进 / 同意推进 / 新建会话后由徽标派发。 */
export const WORKFLOW_STATE_CHANGED_EVENT = 'dsh-workflow-state-changed';
const states = new Map();
const listeners = new Set();
function isNonEmptyString(value) {
    return typeof value === 'string' && value !== '';
}
function notify() {
    for (const listener of listeners) {
        try {
            listener();
        }
        catch {
            // 单个订阅者抛错不能拖垮其他行。
        }
    }
}
/** 读某个会话的状态；没有返回 null（组件据此不渲染圆点）。 */
export function getSessionState(sessionId) {
    if (!isNonEmptyString(sessionId))
        return null;
    return states.get(sessionId) ?? null;
}
/**
 * 全量替换：打开侧栏时同步一次磁盘快照。
 * 空值 / 非法条目直接忽略；有变化才通知，避免无意义重渲染。
 */
export function replaceSessionStates(next) {
    const normalized = Object.entries(next ?? {}).filter(([sessionId, state]) => isNonEmptyString(sessionId) && isNonEmptyString(state));
    if (normalized.length === states.size && normalized.every(([sessionId, state]) => states.get(sessionId) === state)) {
        return;
    }
    states.clear();
    for (const [sessionId, state] of normalized)
        states.set(sessionId, state);
    notify();
}
/** 单条更新：状态变化事件走这里，只影响目标会话。 */
export function setSessionState(sessionId, state) {
    if (!isNonEmptyString(sessionId) || !isNonEmptyString(state))
        return false;
    if (states.get(sessionId) === state)
        return false;
    states.set(sessionId, state);
    notify();
    return true;
}
/** 订阅状态表变化（组件在挂载时订阅，卸载时退订）；返回退订函数。 */
export function subscribeSessionStates(listener) {
    if (typeof listener !== 'function')
        return () => { };
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
/** 解析事件 detail；旧格式（无 detail 的 Event）返回 null，由调用方退回全量重取。 */
export function readStateChangedDetail(event) {
    const detail = event.detail;
    if (detail === undefined || detail === null)
        return null;
    if (!isNonEmptyString(detail.sessionId) || !isNonEmptyString(detail.state))
        return null;
    return { sessionId: detail.sessionId, state: detail.state };
}
//# sourceMappingURL=session-state-store.js.map