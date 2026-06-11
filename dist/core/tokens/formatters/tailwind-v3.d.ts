/**
 * Tailwind v3 config formatter.
 *
 * Output shape:
 *
 *   // tailwind.tokens.js
 *   module.exports = {
 *     colors: {
 *       primary: "#4085F2",
 *       brand: { primary: "#FF00AA" }
 *     },
 *     spacing: {
 *       md: "16px"
 *     }
 *   };
 *
 * Designed to be spread into `tailwind.config.js`:
 *
 *   const tokens = require('./src/styles/generated/tailwind.tokens.js');
 *   module.exports = { theme: { extend: tokens } };
 *
 * Token-to-namespace mapping mirrors Tailwind v3's theme keys:
 *
 *   color/*       → colors.*
 *   spacing/*     → spacing.*
 *   font/*        → fontFamily.*
 *   text/*        → fontSize.*
 *   radius/*      → borderRadius.*
 *
 * Multi-mode tokens flatten to the primary mode (Tailwind v3 doesn't have
 * a native multi-mode model — dark-mode variants come from `tailwindcss`'s
 * `darkMode: 'class'` + separate CSS variable files).
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatTailwindV3(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=tailwind-v3.d.ts.map