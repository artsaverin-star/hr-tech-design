/**
 * Figma Annotations MCP Tools
 * Tools for reading, writing, and managing design annotations on Figma nodes.
 * Annotations are a Plugin API feature — requires Desktop Bridge plugin connection.
 *
 * Annotations are distinct from comments: they are node-level design specs that
 * can pin specific properties (fills, width, typography, etc.) and support
 * markdown-formatted labels. Designers use them to communicate animation timings,
 * accessibility requirements, interaction specs, and other implementation details
 * that don't fit in the description field.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerAnnotationTools(server: McpServer, getDesktopConnector: () => Promise<any>): void;
//# sourceMappingURL=annotation-tools.d.ts.map