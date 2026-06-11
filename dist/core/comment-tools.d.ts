/**
 * Figma Comments MCP Tools
 * Tools for getting, posting, and deleting comments on Figma files via REST API.
 * Works in both local and Cloudflare Workers modes — no Plugin API dependency.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
export declare function registerCommentTools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>, getCurrentUrl: () => string | null, options?: {
    isRemoteMode?: boolean;
}): void;
//# sourceMappingURL=comment-tools.d.ts.map