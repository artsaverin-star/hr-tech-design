/**
 * Canonical internal token model for figma-console-mcp's token sync engine.
 *
 * Every parser (DTCG, Tokens Studio, CSS vars, Tailwind, etc.) produces this
 * shape. Every formatter (DTCG, CSS vars, Tailwind v4, SCSS, TS, etc.) consumes
 * this shape. Keeps the engine fan-out clean: N parsers + M formatters means
 * N + M modules, not N * M conversion pairs.
 *
 * Aligned with the DTCG (Design Tokens Community Group) W3C spec where
 * possible — see https://tr.designtokens.org/format/ — but the internal model
 * is richer because it carries Figma metadata, multi-mode values per-token,
 * and our $extensions for round-trip ID preservation.
 */
/**
 * Identifier returned in MCP-tagged responses so callers know which vendor
 * extensions namespace to read.
 */
export const FIGMA_MCP_EXTENSION_KEY = "figma-console-mcp";
//# sourceMappingURL=types.js.map