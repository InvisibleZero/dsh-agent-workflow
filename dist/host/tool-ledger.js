const MAX_EVENTS = 100;
const entries = [];
export function recordToolEvent(input) {
    const entry = { at: new Date().toISOString(), ...input };
    entries.push(entry);
    if (entries.length > MAX_EVENTS)
        entries.splice(0, entries.length - MAX_EVENTS);
}
export function recentToolEvents(limit = 50) {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_EVENTS) : 50;
    return entries.slice(-n);
}
export function clearToolEvents() {
    entries.length = 0;
}
//# sourceMappingURL=tool-ledger.js.map