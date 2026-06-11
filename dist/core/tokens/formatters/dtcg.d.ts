/**
 * DTCG (Design Tokens Community Group) JSON formatter.
 *
 * Produces W3C-spec DTCG output (https://tr.designtokens.org/format/) with
 * three nuances:
 *
 *   1. Multi-mode tokens. The DTCG v1 spec doesn't natively express modes;
 *      we use a separate file per mode (driven by `splitByMode: true`) or a
 *      single file with values keyed by mode under a vendor extension when
 *      splitByMode is false. The split-file approach is the recommended
 *      pattern in the broader DTCG community and is what Style Dictionary
 *      v4, Tokens Studio, and Figma's announced native export all use.
 *
 *   2. $extensions["figma-console-mcp"]. We stash Figma variable IDs and
 *      last-synced values here for non-destructive round-trip. Other DTCG
 *      tools preserve $extensions verbatim.
 *
 *   3. Composite tokens (typography, shadow, gradient) emit DTCG's
 *      structured $value form. Aliases emit `"$value": "{path.to.target}"`.
 *
 * This formatter is the canonical output — the format every other
 * formatter (CSS variables today, Tailwind/SCSS/etc. in future minor
 * versions) ultimately derives from.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatDtcg(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=dtcg.d.ts.map