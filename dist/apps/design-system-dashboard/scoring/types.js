/**
 * Design System Dashboard — Shared Types
 *
 * Defines the JSON contract between the scoring engine (server-side),
 * the server registration (tools), and the UI (client-side rendering).
 */
/** Build a map of collection ID → collection name for location context. */
export function buildCollectionNameMap(collections) {
    const map = new Map();
    for (const col of collections) {
        if (col.id && col.name)
            map.set(col.id, col.name);
    }
    return map;
}
// ---------------------------------------------------------------------------
// Thresholds and helpers
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
    GOOD: 90,
    NEEDS_WORK: 50,
};
export function getStatus(score) {
    if (score >= THRESHOLDS.GOOD)
        return "good";
    if (score >= THRESHOLDS.NEEDS_WORK)
        return "needs-work";
    return "poor";
}
export function getSeverity(score) {
    if (score >= THRESHOLDS.GOOD)
        return "pass";
    if (score >= THRESHOLDS.NEEDS_WORK)
        return "warning";
    return "fail";
}
/** Clamp a number to 0-100. */
export function clamp(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
//# sourceMappingURL=types.js.map