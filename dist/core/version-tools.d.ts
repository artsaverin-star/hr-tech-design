/**
 * Figma Version History MCP Tools
 *
 *   - figma_get_file_versions: list a file's version history with
 *     auto-pagination, labeled-only filtering by default, and a hard cap.
 *   - figma_get_file_at_version: snapshot a file (or selected nodes) at a
 *     specific version_id. Thin wrapper over getFile/getNodes which already
 *     accept the `version` query param.
 *   - figma_diff_versions: compare two versions. Always returns a page-structure
 *     diff (cheap, 2 API calls). When component_ids are passed, also returns
 *     per-node diffs at depth=2 (added/removed children, name/description
 *     changes, componentPropertyDefinitions changes, boundVariables deltas).
 *   - figma_get_changes_since_version: convenience wrapper for diff against HEAD.
 *   - figma_generate_changelog: human-readable markdown changelog on top of
 *     the diff, with author enrichment via figma_get_file_versions lookback.
 *
 * All tools work in local and Cloudflare Workers modes. Required scope is
 * file_versions:read on OAuth, or "Versions" Read on a Personal Access Token,
 * plus the standard file_content:read for fetching file snapshots.
 *
 * Design notes at .notes/VERSION-HISTORY-DIFF-DESIGN.md.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
/** Test-only: clears the module-scoped snapshot cache so unit tests see fresh state. */
export declare function _clearVersionSnapshotCacheForTesting(): void;
/**
 * v1.25.0: a description/annotation change captured by the Desktop Bridge
 * plugin's documentchange listener. The diff engine queries this buffer to
 * surface metadata changes that Figma REST omits from version snapshots.
 *
 * Filtered by file key, time window (Unix ms), and optionally node IDs.
 */
export interface MetadataChangeBufferEntry {
    node_id: string;
    node_name: string | null;
    node_type: string | null;
    field: "description" | "annotations";
    new_value: any;
    timestamp: number;
}
export type GetMetadataChanges = (options: {
    fileKey?: string;
    since?: number;
    until?: number;
    nodeIds?: string[];
}) => MetadataChangeBufferEntry[];
export declare function registerVersionTools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>, getCurrentUrl: () => string | null, _options?: {
    isRemoteMode?: boolean;
}, getCurrentSelectedNodeIds?: () => string[] | null, 
/**
 * v1.25.0: optional metadata-change buffer reader. When wired (local mode),
 * the diff engine consults this to surface description/annotation edits
 * that Figma REST doesn't expose. In cloud mode (no plugin buffer
 * available), this stays undefined and the diff just doesn't surface
 * those edits — but scope_coverage still tells callers about the gap.
 */
getMetadataChanges?: GetMetadataChanges): void;
//# sourceMappingURL=version-tools.d.ts.map