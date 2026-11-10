// @ts-nocheck
/**
 * 埋点事件环形缓冲：宿主写、`/events` 路由读（让测试/排查能断言埋点，不只进程内日志）。
 *
 * 进程内 `ctx.logger` 是给人看 DSH 日志用的；这里再落一份进内存环，
 * 通过接口暴露出去，测试脚本（独立进程）才能拿到埋点做断言。
 *
 * 每条事件带一个 `trace`：同一次 HTTP 请求内的事件共用一个 id，失败时也回给调用方，
 * 这样「日志里有、调用方没钥匙」的黑盒断点不会出现。
 */
import { randomUUID } from 'node:crypto';

export interface WorkflowEventLog {
  at: string;
  level: 'info' | 'warn';
  message: string;
  /** 同一次请求的关联 id；没有则为 undefined（整键省略，不写 null）。 */
  trace?: string;
}

const MAX_EVENTS = 500;
const events: WorkflowEventLog[] = [];

/** 每次请求生成一个短 id：足够在日志里对上一条，又不用读全 uuid。 */
function newTraceId(): string {
  return `wf-${randomUUID().slice(0, 8)}`;
}

function recordEvent(level: 'info' | 'warn', message: string, trace?: string): void {
  const entry: WorkflowEventLog = { at: new Date().toISOString(), level, message };
  if (typeof trace === 'string' && trace !== '') entry.trace = trace;
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function recentEvents(limit = 100): WorkflowEventLog[] {
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
  return events.slice(-n);
}

/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export function logEvent(logger: any, level: 'info' | 'warn', message: string, trace?: string): void {
  recordEvent(level, message, trace);
  if (level === 'info') logger?.info?.(message);
  else logger?.warn?.(message);
}

export { newTraceId };
