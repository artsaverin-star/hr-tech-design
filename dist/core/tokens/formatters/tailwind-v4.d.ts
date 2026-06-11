/**
 * Tailwind v4 `@theme` block formatter.
 *
 * Tailwind v4 introduced CSS-first configuration: instead of a JS
 * `tailwind.config.js`, you write tokens directly into your CSS with an
 * `@theme inline { ... }` block. Tailwind processes that block to generate
 * utility classes (`bg-primary`, `text-foreground`, etc.) at build time.
 *
 * Output shape:
 *
 *   @theme inline {
 *     --color-primary: #4085F2;
 *     --spacing-md: 16px;
 *     --font-family-sans: "Inter", sans-serif;
 *   }
 *
 *   .dark {
 *     --color-primary: #5599FF;
 *   }
 *
 * Token-to-Tailwind-namespace mapping follows the canonical Tailwind v4
 * convention (see https://tailwindcss.com/docs/theme):
 *
 *   color/*       → --color-*       (maps to bg-*, text-*, border-*, etc.)
 *   spacing/*     → --spacing-*
 *   radius/*      → --radius-*      (maps to rounded-*)
 *   font/*        → --font-*        (font-family namespace)
 *   text/*        → --text-*        (font-size namespace)
 *   font-weight/* → --font-weight-*
 *   tracking/*    → --tracking-*
 *   leading/*     → --leading-*
 *   shadow/*      → --shadow-*
 *
 * Tokens that don't fit a known Tailwind namespace get emitted with their
 * path verbatim (with prefix if configured). They're still valid CSS vars
 * — they just don't generate Tailwind utility classes.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatTailwindV4(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=tailwind-v4.d.ts.map