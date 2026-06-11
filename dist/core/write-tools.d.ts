import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register write/manipulation tools that require a Desktop Bridge connector.
 * Used by both local mode (src/local.ts) and cloud mode (src/index.ts).
 */
export declare function registerWriteTools(server: McpServer, getDesktopConnector: () => Promise<any>): void;
//# sourceMappingURL=write-tools.d.ts.map