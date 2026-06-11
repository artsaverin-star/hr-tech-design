/**
 * Design System Dashboard MCP App - Server Registration
 *
 * Registers tools and resource for the Design System Dashboard MCP App.
 * Uses the official @modelcontextprotocol/ext-apps helpers for proper
 * MCP Apps protocol compatibility with Claude Desktop.
 *
 * Data flow:
 *   1. LLM calls figma_audit_design_system → server fetches + scores data,
 *      returns SHORT summary to LLM (avoids context exhaustion)
 *   2. UI opens, connects, calls ds_dashboard_refresh (app-only visibility)
 *   3. ds_dashboard_refresh returns full JSON → UI renders
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DesignSystemRawData } from "./scoring/types.js";
/**
 * Register the Design System Dashboard MCP App with the server.
 *
 * @param server - The MCP server instance
 * @param getDesignSystemData - Function to fetch raw design system data from Figma
 * @param getCurrentUrl - Optional function to get the current browser URL (for lastFileUrl tracking)
 */
export declare function registerDesignSystemDashboardApp(server: McpServer, getDesignSystemData: (fileUrl?: string) => Promise<DesignSystemRawData>, getCurrentUrl?: () => string | null): void;
//# sourceMappingURL=server.d.ts.map