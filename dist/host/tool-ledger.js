const MAX_EVENTS = 100;
const entries = [];
export function recordToolEvent(input) {
    const entry = { at: new Date().toISOString(), ...input };
    entries.push(entry);
    if (entries.length > MAX_EVENTS)
        entries.splice(0, entries.length - MAX_EVENTS);
}
export function clearToolEvents() {
    entries.length = 0;
}
//# sourceMappingURL=tool-ledger.js.map