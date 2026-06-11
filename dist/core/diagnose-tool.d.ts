/**
 * figma_diagnose — a designer-readable health check for figma-console-mcp.
 *
 * This is the one tool to point a confused user at. It self-identifies the
 * server, reports the transport / plugin / token state in plain language,
 * and explicitly disclaims any token or OAuth error a user might be seeing
 * in chat (those typically come from a different MCP). The response is
 * structured so an LLM is likely to surface the `report` field verbatim.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface DiagnoseToolOptions {
    /** Server build version (e.g. from package.json) */
    getServerVersion: () => string;
    /** "local" for NPX/stdio mode, "cloud" for Cloudflare Workers mode */
    mode: "local" | "cloud";
    /** Snapshot of plugin connection state (or null if no WS server) */
    getPluginState?: () => {
        connected: boolean;
        fileName?: string;
        fileKey?: string | null;
        currentPage?: string;
        editorType?: string;
        port?: number;
        portFallbackFrom?: number;
    } | null;
    /** Snapshot of REST API auth state (best-effort) */
    getTokenState?: () => {
        hasToken: boolean;
        source?: "env" | "oauth" | "bearer";
    };
}
export declare function registerDiagnoseTool(server: McpServer, options: DiagnoseToolOptions): void;
//# sourceMappingURL=diagnose-tool.d.ts.map