/**
 * Server identity helpers.
 *
 * When a user has multiple Figma-related MCP servers configured at once
 * (e.g. figma-console-mcp alongside Figma's native codegen MCP), an LLM can
 * conflate errors from one server with the troubleshooting copy of another —
 * producing remediation advice that points at the wrong tool. Tagging our
 * responses with an explicit `[figma-console-mcp]` prefix and an `_mcp`
 * field makes attribution unambiguous.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare const MCP_NAME = "figma-console-mcp";
export declare const ERROR_PREFIX = "[figma-console-mcp]";
/**
 * Prefix a thrown-error message with our MCP identity so cross-tool errors
 * can't be mistakenly attributed to this server.
 */
export declare function identifiedError(message: string): Error;
/**
 * Tag a response payload with our MCP identity at the top level.
 * The `_mcp` field is read by LLMs alongside the rest of the response and
 * gives them a reliable signal for "which server produced this output".
 */
export declare function withIdentity<T extends Record<string, unknown>>(data: T): T & {
    _mcp: string;
};
/**
 * Monkey-patch an MCP server instance so every tool registered on it gets
 * identity tagging applied to its responses and an identity prefix on any
 * Error it throws — without modifying the ~97 individual tool handlers.
 *
 * Call this once, immediately after constructing the McpServer, BEFORE any
 * tool registration calls run. The wrap is idempotent at the response level
 * (tools that already tag themselves via withIdentity or adaptiveResponse
 * won't get double-tagged).
 *
 * Adds attribution coverage to every response path uniformly — see
 * project_lauren_cross_mcp_confusion for why this matters.
 */
export declare function wrapServerForIdentity(server: McpServer): void;
//# sourceMappingURL=identity.d.ts.map