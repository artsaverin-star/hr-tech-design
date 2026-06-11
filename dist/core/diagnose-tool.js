/**
 * figma_diagnose — a designer-readable health check for figma-console-mcp.
 *
 * This is the one tool to point a confused user at. It self-identifies the
 * server, reports the transport / plugin / token state in plain language,
 * and explicitly disclaims any token or OAuth error a user might be seeing
 * in chat (those typically come from a different MCP). The response is
 * structured so an LLM is likely to surface the `report` field verbatim.
 */
import { z } from "zod";
import { MCP_NAME, withIdentity } from "./identity.js";
function buildReport(opts) {
    const lines = [];
    lines.push(`# ${MCP_NAME} diagnostic`);
    lines.push("");
    lines.push(`Server version: ${opts.getServerVersion()}`);
    lines.push(`Mode: ${opts.mode === "local" ? "Local (stdio + WebSocket plugin bridge)" : "Cloud (Cloudflare Workers)"}`);
    lines.push("");
    const plugin = opts.getPluginState?.();
    lines.push("## Plugin connection");
    if (!plugin) {
        lines.push("- No WebSocket server (cloud mode runs without a local plugin bridge unless paired).");
    }
    else if (plugin.connected) {
        const portInfo = plugin.portFallbackFrom && plugin.port && plugin.port !== plugin.portFallbackFrom
            ? `port ${plugin.port} (fallback from ${plugin.portFallbackFrom})`
            : plugin.port
                ? `port ${plugin.port}`
                : "connected";
        lines.push(`- ✅ Desktop Bridge plugin connected on ${portInfo}.`);
        if (plugin.fileName) {
            lines.push(`- Active file: **${plugin.fileName}**${plugin.currentPage ? ` (page: ${plugin.currentPage})` : ""}.`);
        }
        if (plugin.editorType && plugin.editorType !== "figma") {
            lines.push(`- Editor type: ${plugin.editorType}.`);
        }
    }
    else {
        lines.push(`- ⚠️ Desktop Bridge plugin not connected${plugin.port ? ` (server is listening on port ${plugin.port})` : ""}.`);
        lines.push("- To fix: open the Figma Desktop Bridge plugin in Figma Desktop. If it was already running, close and reopen it once.");
    }
    lines.push("");
    const token = opts.getTokenState?.();
    lines.push("## REST API token");
    if (!token) {
        lines.push("- Token state not available in this mode.");
    }
    else if (token.hasToken) {
        lines.push(`- ✅ Figma access token detected (source: ${token.source ?? "unknown"}). REST-based tools should work.`);
    }
    else {
        lines.push("- ⚠️ No Figma access token detected. Plugin-based tools still work; REST-only tools (file data, version history, image rendering) will return an auth error.");
        if (opts.mode === "local") {
            lines.push("- To enable REST tools: set FIGMA_ACCESS_TOKEN in your MCP client config. Generate a token at https://www.figma.com/developers/api#access-tokens.");
        }
        else {
            lines.push("- To enable REST tools: authenticate via your MCP client's OAuth flow or pass a Figma personal access token (figd_...) as a Bearer token.");
        }
    }
    lines.push("");
    lines.push("## If you're seeing token / OAuth errors in chat");
    lines.push(`If you see messages like "API token has expired" or "Bearer token has expired" and the response above does NOT show a token problem, the error is most likely coming from a **different MCP server**, not from ${MCP_NAME}.`);
    lines.push("");
    lines.push("Common cause: Figma's native MCP (often listed as just `Figma` in your MCP client) is also installed and its OAuth session expired. Check your MCP client's server list. Errors from those servers are not produced by figma-console-mcp.");
    lines.push("");
    return lines.join("\n");
}
export function registerDiagnoseTool(server, options) {
    server.tool("figma_diagnose", `Designer-readable health check for ${MCP_NAME}. Use this when something seems wrong — it self-identifies the server, reports plugin connection / file / token status in plain language, and disambiguates errors that may be coming from a different Figma-related MCP server. Recommended as the first step when a user reports a "token expired" or "plugin disconnected" issue.`, {
        verbose: z
            .boolean()
            .optional()
            .default(false)
            .describe("Include the raw structured state alongside the human-readable report."),
    }, async ({ verbose }) => {
        const report = buildReport(options);
        const details = verbose
            ? {
                plugin: options.getPluginState?.() ?? null,
                token: options.getTokenState?.() ?? null,
            }
            : undefined;
        const payload = withIdentity({
            report,
            ...(details ? { details } : {}),
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload),
                },
            ],
        };
    });
}
//# sourceMappingURL=diagnose-tool.js.map