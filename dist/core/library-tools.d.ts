/**
 * Library Tools
 *
 * MCP tools for inspecting components from PUBLISHED shared/team libraries
 * without needing the source library file URL — only a component key
 * (the 40-char hex returned by component search results) is required.
 *
 * Bridges the gap between component discovery (search_design_system /
 * figma_search_components / figma_get_library_components) and full property
 * inspection (componentPropertyDefinitions, variants, visual specs).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
import type { IFigmaConnector } from "./figma-connector.js";
export declare function registerLibraryTools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>): void;
export declare function registerLibraryVariableTools(server: McpServer, getDesktopConnector: () => Promise<IFigmaConnector>): void;
//# sourceMappingURL=library-tools.d.ts.map