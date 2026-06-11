/**
 * In-memory LRU cache for Figma file snapshots at past versions.
 *
 * Past versions are immutable, so a cached snapshot for `${fileKey}:${versionId}`
 * never goes stale. The cache is process-scoped (no persistence) and bounded by
 * a max-entries cap rather than a byte budget — keeps the implementation simple
 * and avoids assumptions about JSON serialization size.
 *
 * HEAD ("current") is intentionally NOT cached because it changes on every save.
 * Callers should pass `null` as the versionId for HEAD requests; the cache
 * methods short-circuit on null.
 *
 * Usage:
 *   const cache = new VersionSnapshotCache();
 *   const key = cache.makeKey(fileKey, versionId, depth, nodeIds);
 *   let snapshot = cache.get(key);
 *   if (!snapshot) {
 *     snapshot = await api.getFile(fileKey, { version: versionId, depth });
 *     cache.set(key, snapshot);
 *   }
 */
export interface VersionSnapshotCacheOptions {
    maxEntries?: number;
}
export declare class VersionSnapshotCache {
    private readonly maxEntries;
    private readonly store;
    constructor(options?: VersionSnapshotCacheOptions);
    /**
     * Build a stable cache key from the request parameters.
     * Returns null for HEAD requests (versionId is null/undefined/empty).
     */
    makeKey(fileKey: string, versionId: string | null | undefined, depth: number | undefined, nodeIds?: string[]): string | null;
    get<T = unknown>(key: string | null): T | undefined;
    set(key: string | null, value: unknown): void;
    has(key: string | null): boolean;
    get size(): number;
    clear(): void;
}
//# sourceMappingURL=version-cache.d.ts.map