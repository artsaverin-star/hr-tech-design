/**
 * MCP tool registrar for figma_export_tokens and figma_import_tokens.
 *
 * Current scope (v1.27.0):
 *   - figma_export_tokens: working for DTCG JSON (canonical) and CSS
 *     custom properties output. Other formats (Tailwind v4, SCSS, TS
 *     module, Tokens Studio, Style Dictionary v3) are scaffolded and
 *     return TokenFormatNotImplementedError with a helpful message
 *     directing users to DTCG.
 *   - figma_import_tokens: working for DTCG JSON input with full
 *     diff-aware merge. Apply phase pushes value updates (toUpdate) to
 *     Figma via the plugin bridge — verified end-to-end against real
 *     multi-mode design systems. toCreate / toDelete / alias-target
 *     updates surface in the diff plan but are not yet wired through
 *     the apply phase (use figma_setup_design_tokens /
 *     figma_batch_create_variables / figma_delete_variable manually for
 *     those for now).
 *
 * Both tools auto-discover `tokens.config.json` at the project root and use
 * its source/generated/modes/conflictResolution settings as defaults. They
 * stay zero-arg in normal use.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface RegisterTokensToolsOptions {
    /**
     * True when registering in Cloud Mode (Cloudflare Workers). In Cloud Mode
     * the MCP server has no local filesystem access, so the tools surface a
     * clear "inline payload required" error instead of letting an fs ENOENT
     * bubble up cryptically. Export still works with explicit content return;
     * import still works with inline payload/files. tokens.config.json
     * autodiscovery, outputPath disk writes, and config-source file reads
     * are all Local Mode only.
     */
    isRemoteMode?: boolean;
}
export declare function registerExportTokensTool(server: McpServer, getDesktopConnector: () => Promise<any>, opts?: RegisterTokensToolsOptions): void;
export declare function registerImportTokensTool(server: McpServer, getDesktopConnector: () => Promise<any>, opts?: RegisterTokensToolsOptions): void;
/**
 * Convenience: register both tools at once.
 */
export declare function registerTokensTools(server: McpServer, getDesktopConnector: () => Promise<any>, opts?: RegisterTokensToolsOptions): void;
//# sourceMappingURL=tokens-tools.d.ts.map