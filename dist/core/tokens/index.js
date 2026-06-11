/**
 * Public surface of the token sync engine.
 *
 * Re-exports the canonical types, the parser/formatter dispatchers, the
 * config loader, the alias resolver, and the Figma converter. External
 * callers (tools, tests) should import from here rather than reaching into
 * subdirectories.
 */
export { FIGMA_MCP_EXTENSION_KEY } from "./types.js";
export { TokensConfigSchema, loadTokensConfig, findTokensConfig, DEFAULT_TOKENS_CONFIG, buildSuggestedScaffold, resolveOutputTargets, resolveConflictStrategy, } from "./config.js";
export { ExportTokensInputSchema, ImportTokensInputSchema, ExportFormatSchema, ImportFormatSchema, SyncStrategySchema, ConflictResolutionSchema, } from "./schemas.js";
export { parse, detectFormat, } from "./parsers/index.js";
export { format, } from "./formatters/index.js";
export { buildTokenIndex, resolveReference, resolveAliasChain, validateAliases, formatDtcgReference, parseDtcgReference, } from "./alias-resolver.js";
export { convertFigmaVariablesToDocument, } from "./figma-converter.js";
//# sourceMappingURL=index.js.map