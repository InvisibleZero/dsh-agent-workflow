// @ts-nocheck
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

const MAX_EVENTS = 500;
const events: WorkflowEventLog[] = [];

export function recordEvent(level: 'info' | 'warn', message: string): void {
  events.push({ at: new Date().toISOString(), level, message });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function recentEvents(limit = 100): WorkflowEventLog[] {
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
  return events.slice(-n);
}

/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export function logEvent(logger: any, level: 'info' | 'warn', message: string): void {
  recordEvent(level, message);
  if (level === 'info') logger?.info?.(message);
  else logger?.warn?.(message);
}
