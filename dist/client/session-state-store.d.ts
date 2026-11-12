/**
 * 侧栏会话状态表（客户端共享单例）。
 *
 * 为什么单独成模块：状态点要能在「一次全量加载」和「单条状态变化」两种入口下更新，
 * 但这两条路径不该各自维护一份数据。这里只做内存表 + 订阅，不碰 DOM、不发请求，
 * 组件和同步逻辑都只是它的使用方。
 */
/** 状态变化事件名：推进 / 同意推进 / 新建会话后由徽标派发。 */
export declare const WORKFLOW_STATE_CHANGED_EVENT = "dsh-workflow-state-changed";
/** 事件 detail：只带「哪个会话、变成什么状态」，不再让每个点各自重取。 */
interface WorkflowStateChangedDetail {
    sessionId: string;
    state: string;
}
/** 读某个会话的状态；没有返回 null（组件据此不渲染圆点）。 */
export declare function getSessionState(sessionId: string): string | null;
/**
 * 全量替换：打开侧栏时同步一次磁盘快照。
 * 空值 / 非法条目直接忽略；有变化才通知，避免无意义重渲染。
 */
export declare function replaceSessionStates(next: Record<string, string>): void;
/** 单条更新：状态变化事件走这里，只影响目标会话。 */
export declare function setSessionState(sessionId: string, state: string): boolean;
/** 订阅状态表变化（组件在挂载时订阅，卸载时退订）；返回退订函数。 */
export declare function subscribeSessionStates(listener: () => void): () => void;
/** 解析事件 detail；旧格式（无 detail 的 Event）返回 null，由调用方退回全量重取。 */
export declare function readStateChangedDetail(event: Event): WorkflowStateChangedDetail | null;
export {};
//# sourceMappingURL=session-state-store.d.ts.map