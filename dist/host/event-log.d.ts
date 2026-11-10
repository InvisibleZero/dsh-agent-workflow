/**
 * 埋点事件环形缓冲：宿主写、`/events` 路由读（让测试/排查能断言埋点，不只进程内日志）。
 *
 * 进程内 `ctx.logger` 是给人看 DSH 日志用的；这里再落一份进内存环，
 * 通过接口暴露出去，测试脚本（独立进程）才能拿到埋点做断言。
 */
export interface WorkflowEventLog {
    at: string;
    level: 'info' | 'warn';
    message: string;
}
export declare function recordEvent(level: 'info' | 'warn', message: string): void;
export declare function recentEvents(limit?: number): WorkflowEventLog[];
/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export declare function logEvent(logger: any, level: 'info' | 'warn', message: string): void;
//# sourceMappingURL=event-log.d.ts.map