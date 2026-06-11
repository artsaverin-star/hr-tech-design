/**
 * Bridge-first variable resolution.
 *
 * Figma's Variables REST API (`/files/:key/variables/local`) is **Enterprise-only**
 * and returns 403 for the majority of users (Starter/Pro/Org). The Desktop Bridge
 * and cloud relay read variables through the Plugin API
 * (`figma.variables.getLocalVariablesAsync`), which works on **every** Figma plan.
 *
 * Orchestration tools (e.g. `figma_get_design_system_kit`) historically called the
 * REST API directly and dead-ended on a 403 for non-Enterprise users — even when a
 * bridge was connected. This helper mirrors `figma_get_variables`' resolution order
 * so every variable-reading tool behaves consistently:
 *
 *   1. Desktop Bridge / cloud relay (any plan)  ← preferred
 *   2. REST Variables API (Enterprise only)      ← fallback
 *
 * It returns the same normalized shape as `formatVariables()`.
 */
import { type FigmaAPI } from "./figma-api.js";
export interface ResolvedVariables {
    collections: any[];
    variables: any[];
    summary: {
        totalCollections: number;
        totalVariables: number;
        variablesByType: Record<string, number>;
    };
    /** Which transport actually produced the data. */
    source: "desktop_bridge" | "rest_api";
}
/**
 * Resolve + format local variables, preferring the Desktop Bridge / cloud relay and
 * falling back to the Enterprise-only REST API only when no bridge is connected.
 *
 * @throws a bridge-pointing error when the bridge is unavailable AND the REST API
 *         fails (e.g. 403 without Enterprise), so callers/LLMs retry via the bridge
 *         instead of treating variables as inaccessible.
 */
export declare function resolveFormattedVariables(opts: {
    getDesktopConnector?: () => Promise<any>;
    getFigmaAPI: () => Promise<FigmaAPI>;
    fileKey: string;
    timeoutMs?: number;
}): Promise<ResolvedVariables>;
//# sourceMappingURL=variable-resolver.d.ts.map