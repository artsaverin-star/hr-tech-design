/**
 * Figma API MCP Tools
 * MCP tool definitions for Figma REST API data extraction
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
/**
 * Options for registering Figma API tools
 */
interface FigmaAPIToolsOptions {
    /** When true, suppresses Desktop Bridge mentions in tool descriptions (for remote/cloud mode) */
    isRemoteMode?: boolean;
}
/**
 * Register Figma API tools with the MCP server
 */
export declare function registerFigmaAPITools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>, getCurrentUrl: () => string | null, variablesCache?: Map<string, {
    data: any;
    timestamp: number;
}>, options?: FigmaAPIToolsOptions, getDesktopConnector?: () => Promise<any>): void;
export {};
//# sourceMappingURL=figma-tools.d.ts.map