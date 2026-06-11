/**
 * SCSS variables formatter.
 *
 * Output shape:
 *
 *   // tokens.scss
 *   $ds-color-primary: #4085F2;
 *   $ds-spacing-md: 16px;
 *
 *   // map for runtime mode access
 *   $ds-colors: (
 *     "primary": $ds-color-primary,
 *     ...
 *   );
 *
 * Modes: SCSS doesn't have CSS's runtime cascading, so multi-mode output
 * either emits one file per mode (splitByMode: true) or generates SCSS
 * maps keyed by mode name that consumers can `map-get` from.
 *
 * Composite tokens (typography, shadow) expand into multiple primitive
 * variables since SCSS variables hold a single value.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatScss(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=scss.d.ts.map