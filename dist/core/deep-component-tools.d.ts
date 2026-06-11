/**
 * Deep Component Extraction MCP Tool
 *
 * Provides unlimited-depth component tree extraction via the Desktop Bridge
 * Plugin API. Returns full visual properties, resolved design token names,
 * instance references (mainComponent), prototype reactions, and annotations
 * at every level of the tree.
 *
 * This complements figma_get_component_for_development (REST API, depth 4)
 * with deeper, richer data when the Desktop Bridge plugin is connected.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerDeepComponentTools(server: McpServer, getDesktopConnector: () => Promise<any>): void;
//# sourceMappingURL=deep-component-tools.d.ts.map