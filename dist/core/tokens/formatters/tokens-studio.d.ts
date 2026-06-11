/**
 * Tokens Studio for Figma JSON formatter.
 *
 * Tokens Studio uses a multi-file layout:
 *
 *   $themes.json      — array of theme definitions with selectedTokenSets
 *   $metadata.json    — list of token set names + tokenSetOrder
 *   primitives.json   — one file per token set
 *   semantic.json
 *   theme/light.json
 *   theme/dark.json
 *
 * Each per-set file holds tokens with the Tokens Studio shape:
 *
 *   {
 *     "color": {
 *       "primary": {
 *         "value": "#4085F2",
 *         "type": "color",
 *         "description": "Primary brand color"
 *       }
 *     }
 *   }
 *
 * Tokens Studio uses bare `value` / `type` (no `$` prefix — same as
 * Style Dictionary v3, which the plugin's format is based on). Aliases
 * use `{path.to.token}` syntax.
 *
 * `$themes.json` carries the Figma collection/mode bindings that make
 * Tokens Studio's "send to Figma" feature work — preserved here for
 * round-trip with Tokens Studio plugin users (notably Altitude).
 *
 * Output strategy:
 *   - One file per TokenSet, named after the set (slugified).
 *   - Multi-mode sets emit one file per (set, mode) pair (Tokens Studio
 *     convention).
 *   - `$metadata.json` enumerates the token set names in order.
 *   - `$themes.json` builds a theme entry per mode with selectedTokenSets
 *     and the figma-console-mcp metadata stamped onto it.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatTokensStudio(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=tokens-studio.d.ts.map