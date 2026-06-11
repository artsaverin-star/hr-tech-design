/**
 * Pure-function markdown formatter for version diff results.
 *
 * Takes a diff payload (the structured response from figma_diff_versions)
 * plus optional author/label metadata for the from/to versions, and produces
 * a release-notes-style markdown string.
 *
 * Mode-aware:
 *   summary  — header + a single line of counts
 *   standard — header + page section + per-component counts
 *   detailed — header + page section + per-component property/binding details
 *
 * Pure: no I/O, no side effects. Trivially testable.
 */
import type { DiffMode, NodeDiff, PageStructureDiff } from "./diff-engine.js";
export interface VersionAuthorMeta {
    version_id: string;
    label?: string | null;
    created_at?: string | null;
    user_handle?: string | null;
    is_head?: boolean;
}
export interface ChangelogInput {
    file_key: string;
    file_name?: string | null;
    from_version_id: string;
    to_version_id: string;
    from_meta?: VersionAuthorMeta | null;
    to_meta?: VersionAuthorMeta | null;
    page_structure: PageStructureDiff;
    scoped_nodes?: NodeDiff[];
    notes?: string[];
}
export declare function formatChangelogMarkdown(input: ChangelogInput, mode?: DiffMode): string;
//# sourceMappingURL=changelog-formatter.d.ts.map