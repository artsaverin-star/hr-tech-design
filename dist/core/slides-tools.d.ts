import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register Figma Slides tools.
 * These tools only work when the connected file is a Figma Slides presentation (editorType === 'slides').
 * Used by both local mode (src/local.ts) and cloud mode (src/index.ts).
 */
export declare function registerSlidesTools(server: McpServer, getDesktopConnector: () => Promise<any>): void;
//# sourceMappingURL=slides-tools.d.ts.map