/**
 * Style Dictionary v3 source-format JSON formatter.
 *
 * SD v3 uses bare `value` / `type` fields (no `$` prefix, that's the DTCG
 * convention SD v4 adopted). Output is structurally similar to DTCG but
 * without the dollar signs, and groups have no special meta — just
 * nested objects.
 *
 * Output shape:
 *
 *   {
 *     "color": {
 *       "primary": {
 *         "value": "#4085F2",
 *         "type": "color",
 *         "comment": "Primary brand color"
 *       },
 *       "brand": {
 *         "blue": { "value": "#0066FF", "type": "color" }
 *       }
 *     },
 *     "spacing": {
 *       "md": { "value": "16px", "type": "size" }
 *     }
 *   }
 *
 * SD v3 type names differ slightly from DTCG:
 *
 *   DTCG type    →  SD v3 type
 *   ----------------------------
 *   dimension    →  size (or spacing for spacing tokens)
 *   color        →  color
 *   fontFamily   →  string
 *   fontWeight   →  number
 *
 * Aliases use SD v3's `{path.to.token}` syntax (same as DTCG, which copied
 * it from SD).
 *
 * For back-compat with cbds-components / blocks / czi-edu / eddie-design-system
 * which still use SD v3's bare-key source format.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatStyleDictionaryV3(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=style-dictionary-v3.d.ts.map