/**
 * Diff engine — pure functions for comparing Figma file/node snapshots
 * across two versions.
 *
 * Scope (v1):
 *   - Page-structure diff (added/removed/renamed pages) from depth=1 file fetches
 *   - Per-node diff for scoped fetches: name, description, children added/removed,
 *     componentPropertyDefinitions changes (for COMPONENT_SET), boundVariables changes
 *
 * NOT in scope (deferred):
 *   - Variable VALUE history (Figma REST does not expose this; planned forward
 *     ledger will fill the gap going forward, never retroactively)
 *   - Style-content diffs (only style add/remove via reachable styles map)
 *   - Inside-fills/strokes binding diffs (top-level boundVariables only for v1)
 */
export type DiffMode = "summary" | "standard" | "detailed";
export interface PageEntry {
    id: string;
    name: string;
}
export interface PageStructureDiff {
    pages_added: PageEntry[];
    pages_removed: PageEntry[];
    pages_renamed: Array<{
        id: string;
        old_name: string;
        new_name: string;
    }>;
    summary: {
        added: number;
        removed: number;
        renamed: number;
    };
}
/**
 * Compare two file documents (from /v1/files/:key?version=X with depth=1 or higher).
 * Both arguments should be the `document` field of a Figma file response.
 */
export declare function diffPageStructure(fromDoc: any, toDoc: any): PageStructureDiff;
export interface PropertyDefSummary {
    name: string;
    type: string;
    default_value: any;
}
export interface ComponentPropertyDefDiff {
    added: PropertyDefSummary[];
    removed: PropertyDefSummary[];
    type_changed: Array<{
        name: string;
        from_type: string;
        to_type: string;
    }>;
    default_changed: Array<{
        name: string;
        from_default: any;
        to_default: any;
    }>;
    summary: {
        added: number;
        removed: number;
        type_changed: number;
        default_changed: number;
    };
}
/**
 * Diff a COMPONENT_SET's componentPropertyDefinitions map.
 * Each definition is keyed by `propName#nodeId` in Figma's response.
 */
export declare function diffComponentPropertyDefinitions(fromDefs: Record<string, any> | undefined, toDefs: Record<string, any> | undefined): ComponentPropertyDefDiff;
export interface BindingChange {
    node_id: string;
    node_name: string;
    property: string;
    from_variable_id: string | null;
    to_variable_id: string | null;
    change_kind: "added" | "removed" | "rebound";
}
/**
 * Walk both node trees in parallel (matched by node id), comparing top-level
 * boundVariables. Inside-fills/strokes binding diffs are explicitly NOT included
 * in v1 — they add complexity for marginal additional value over node-level deltas.
 */
export declare function collectBindingChanges(fromNode: any, toNode: any): BindingChange[];
export interface NodeChildSummary {
    id: string;
    name: string;
    type: string;
}
/**
 * v1.25.0: a metadata-only change captured via the Plugin API session buffer.
 * Surfaces description/annotation edits that Figma REST doesn't expose in
 * version snapshots. Populated when the diff time window overlaps with
 * buffered plugin events; absent/empty otherwise.
 */
export interface MetadataChange {
    field: "description" | "annotations";
    new_value: any;
    timestamp: number;
    source: "plugin_buffer";
}
export interface NodeDiff {
    node_id: string;
    node_name: string;
    node_type: string;
    name_changed: {
        from: string;
        to: string;
    } | null;
    description_changed: {
        from: string;
        to: string;
    } | null;
    children_added: NodeChildSummary[];
    children_removed: NodeChildSummary[];
    component_properties: ComponentPropertyDefDiff | null;
    binding_changes: BindingChange[];
    /** v1.25.0: description/annotation changes captured via plugin session buffer */
    metadata_changes?: MetadataChange[];
    change_count: number;
    notes: string[];
}
/**
 * Diff a single node (typically a COMPONENT_SET) at depth=2. Either side may be
 * null/undefined to represent "newly added" or "removed entirely."
 */
export declare function diffNode(fromNode: any, toNode: any, mode?: DiffMode): NodeDiff;
//# sourceMappingURL=diff-engine.d.ts.map