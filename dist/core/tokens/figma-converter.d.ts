/**
 * Convert Figma's variables API response into our canonical TokenDocument.
 *
 * Input: the shape produced by `formatVariables()` in src/core/figma-api.ts
 * (an object with `collections` and `variables` arrays, matching either the
 * REST API's response or the Desktop Bridge plugin's `getLocalVariablesAsync`
 * normalized payload).
 *
 * Output: a TokenDocument with one TokenSet per collection, paths derived
 * from Figma variable names (slash-separated → path arrays), values
 * normalized to our TokenValue shape, and Figma IDs preserved in
 * $extensions["figma-console-mcp"] for round-trip non-destructiveness.
 */
import type { TokenDocument } from "./types.js";
/**
 * Shape of Figma's variable collection as returned by formatVariables(). We
 * use a narrow structural type rather than importing the existing `any`
 * shape from figma-api.ts.
 */
interface FigmaCollection {
    id: string;
    name: string;
    key?: string;
    modes: Array<{
        modeId: string;
        name: string;
    }>;
    variableIds: string[];
}
interface FigmaVariable {
    id: string;
    name: string;
    key?: string;
    resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
    variableCollectionId: string;
    description?: string;
    scopes?: string[];
    /**
     * Per-mode values. Each value is either a literal or a `{ type: "VARIABLE_ALIAS", id }`
     * pointing at another variable.
     */
    valuesByMode: Record<string, FigmaValue>;
}
type FigmaValue = {
    r: number;
    g: number;
    b: number;
    a?: number;
} | number | string | boolean | VariableAlias;
interface VariableAlias {
    type: "VARIABLE_ALIAS";
    id: string;
}
export interface FigmaVariablesPayload {
    collections: FigmaCollection[];
    variables: FigmaVariable[];
}
export interface ConvertOptions {
    /** Figma file key. Stored in document metadata. */
    figmaFileKey?: string;
    /** ISO timestamp to stamp the exportedAt field. Defaults to now. */
    exportedAt?: string;
    /** MCP version string. */
    mcpVersion?: string;
    /** Filter to specific collection IDs. Undefined or empty means all. */
    collectionIds?: string[];
    /** Filter to specific mode names. Undefined means all. */
    modes?: string[] | "all";
    /** Optional prefix that gets stripped from variable names on conversion. */
    stripPrefix?: string;
}
export interface ConvertResult {
    document: TokenDocument;
    warnings: string[];
}
/**
 * Convert a Figma variables payload to our canonical TokenDocument.
 */
export declare function convertFigmaVariablesToDocument(payload: FigmaVariablesPayload, opts?: ConvertOptions): ConvertResult;
export {};
//# sourceMappingURL=figma-converter.d.ts.map