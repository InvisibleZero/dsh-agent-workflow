const MAX_EVENTS = 500;
const events = [];
export function recordEvent(level, message) {
    events.push({ at: new Date().toISOString(), level, message });
    if (events.length > MAX_EVENTS)
        events.splice(0, events.length - MAX_EVENTS);
}
export function recentEvents(limit = 100) {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
    return events.slice(-n);
}
/** 一条埋点同时写进程内日志（人看）+ 内存环（测试读）。 */
export function logEvent(logger, level, message) {
    recordEvent(level, message);
    if (level === 'info')
        logger?.info?.(message);
    else
        logger?.warn?.(message);
}
//# sourceMappingURL=event-log.js.map