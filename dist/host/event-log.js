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
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const MAX_EVENTS = 500;
const events = [];
/**
 * 审计落盘：内存环只留最近 500 条、重启即丢；落一份 append-only JSONL 进运行数据目录，
 * 让「谁批准了推进 / 哪条被拒」不随重启消失。文件路径由宿主在 apply() 里配置一次；
 * 没配置时退化为纯内存（不抛错）。
 */
let logFilePath = null;
let writeChain = Promise.resolve();
/** 宿主启动时调用一次：指定事件日志落盘文件所在目录。 */
export function configureEventLog(dir) {
    if (typeof dir !== 'string' || dir.trim() === '')
        return;
    logFilePath = join(dir, 'events.jsonl');
}
/** 按顺序异步追加一行；写失败只影响持久化，不影响内存环与功能。 */
function persistEvent(entry) {
    if (logFilePath === null)
        return;
    const line = `${JSON.stringify(entry)}\n`;
    writeChain = writeChain
        .then(async () => {
        await mkdir(dirname(logFilePath), { recursive: true });
        await appendFile(logFilePath, line, 'utf8');
    })
        .catch(() => {
        // 落盘失败静默：审计持久化是附加能力，不能反过来拖垮主流程。
    });
}
/** 每次请求生成一个短 id：足够在日志里对上一条，又不用读全 uuid。 */
function newTraceId() {
    return `wf-${randomUUID().slice(0, 8)}`;
}
function recordEvent(level, message, trace) {
    const entry = { at: new Date().toISOString(), level, message };
    if (typeof trace === 'string' && trace !== '')
        entry.trace = trace;
    events.push(entry);
    if (events.length > MAX_EVENTS)
        events.splice(0, events.length - MAX_EVENTS);
    persistEvent(entry);
}
export function recentEvents(limit = 100) {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
    return events.slice(-n);
}
/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export function logEvent(logger, level, message, trace) {
    recordEvent(level, message, trace);
    if (level === 'info')
        logger?.info?.(message);
    else
        logger?.warn?.(message);
}
export { newTraceId };
/** 等当前已排队的落盘写全部完成。测试清理临时目录前先 await 它，避免 rm 与异步 append 竞争。 */
export async function flushEventLog() {
    await writeChain;
}
//# sourceMappingURL=event-log.js.map