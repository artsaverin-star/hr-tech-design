/**
 * Plain JSON formatters — flat and nested.
 *
 * These are dumps without the DTCG `$type`/`$value` envelope, for custom
 * build scripts that just need a key-value map of resolved tokens.
 *
 * Flat shape:
 *
 *   {
 *     "ds-color-primary": "#4085F2",
 *     "ds-spacing-md": "16px",
 *     "ds-color-bg--dark": "#0A0A0A"
 *   }
 *
 * Multi-mode tokens flatten with `--<mode>` suffix (primary mode keeps
 * the bare name; other modes get suffixed).
 *
 * Nested shape:
 *
 *   {
 *     "color": {
 *       "primary": "#4085F2",
 *       "brand": { "primary": "#FF00AA" }
 *     },
 *     "spacing": { "md": "16px" }
 *   }
 *
 * Multi-mode tokens become objects: `{ Light: "...", Dark: "..." }`.
 *
 * Aliases resolve to the literal value where possible; cross-library
 * aliases get a `null` (caller can decide how to fill those in).
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatJsonFlat(doc: TokenDocument, opts: FormatOptions): FormatResult;
export declare function formatJsonNested(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=json.d.ts.map