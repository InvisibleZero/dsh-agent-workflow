export interface WorkflowEventLog {
    at: string;
    level: 'info' | 'warn';
    message: string;
    /** 同一次请求的关联 id；没有则为 undefined（整键省略，不写 null）。 */
    trace?: string;
}
/** 每次请求生成一个短 id：足够在日志里对上一条，又不用读全 uuid。 */
declare function newTraceId(): string;
export declare function recentEvents(limit?: number): WorkflowEventLog[];
/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export declare function logEvent(logger: any, level: 'info' | 'warn', message: string, trace?: string): void;
export { newTraceId };
//# sourceMappingURL=event-log.d.ts.map