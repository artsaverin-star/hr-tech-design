/**
 * Token Browser MCP App - Server Registration
 *
 * Registers tools and resource for the Token Browser MCP App.
 * Uses the official @modelcontextprotocol/ext-apps helpers for proper
 * MCP Apps protocol compatibility with Claude Desktop.
 *
 * Data flow:
 *   1. LLM calls figma_browse_tokens → server fetches + caches data,
 *      returns SHORT summary to LLM (avoids context exhaustion)
 *   2. UI opens, connects, calls token_browser_refresh (app-only visibility)
 *   3. token_browser_refresh returns full JSON → UI renders
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register the Token Browser MCP App with the server.
 *
 * @param server - The MCP server instance
 * @param getVariablesHandler - Function to fetch variables data
 */
export declare function registerTokenBrowserApp(server: McpServer, getVariablesHandler: (fileUrl?: string) => Promise<{
    variables: any[];
    collections: any[];
    [key: string]: any;
}>): void;
//# sourceMappingURL=server.d.ts.map