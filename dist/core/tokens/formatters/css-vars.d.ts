/**
 * CSS custom properties formatter.
 *
 * Converts a TokenDocument to one or more CSS files containing `:root { ... }`
 * (and optionally per-mode selectors like `.dark { ... }`). The first
 * "real" non-DTCG output, completing the canonical-to-runtime pipeline.
 *
 * Behavior:
 *   - Each token becomes a CSS custom property. Path joined with `-`,
 *     optionally prefixed. `color/primary` → `--color-primary`.
 *   - Aliases resolve to `var(--target-token)` so CSS cascading still works.
 *   - Composite tokens (typography, shadow) expand into multiple primitive
 *     custom properties since CSS doesn't natively express composites.
 *   - Single-mode tokens go in `:root`.
 *   - Multi-mode tokens emit per-mode selectors. Heuristic: a mode named
 *     `Light`/`Default` becomes `:root`; `Dark` becomes `.dark` (Tailwind
 *     convention); other modes become `[data-theme="<name>"]`.
 *   - splitByMode emits one file per mode with just that mode's values.
 *   - splitByCollection emits one file per set.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatCssVars(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=css-vars.d.ts.map