import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register FigJam-specific tools.
 * These tools only work when the connected file is a FigJam board (editorType === 'figjam').
 * Used by both local mode (src/local.ts) and cloud mode (src/index.ts).
 */
export declare function registerFigJamTools(server: McpServer, getDesktopConnector: () => Promise<any>): void;
//# sourceMappingURL=figjam-tools.d.ts.map