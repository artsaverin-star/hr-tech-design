/**
 * TypeScript module formatter.
 *
 * Output shape:
 *
 *   // tokens.ts
 *   export const tokens = {
 *     color: {
 *       primary: "#4085F2",
 *       brand: { primary: "#FF00AA" }
 *     },
 *     spacing: {
 *       md: "16px"
 *     }
 *   } as const;
 *
 *   export type Tokens = typeof tokens;
 *
 * Multi-mode tokens emit as nested objects keyed by mode name:
 *
 *   export const tokens = {
 *     mode: {
 *       primary: { Light: "#FFFFFF", Dark: "#000000" }
 *     }
 *   } as const;
 *
 * Aliases get resolved at write time to the literal value (TypeScript
 * can't natively express references). Cross-library aliases get emitted
 * as `null` with a "TODO: cross-library alias unresolved" comment so
 * consumers see the gap.
 */
import type { TokenDocument } from "../types.js";
import type { FormatOptions, FormatResult } from "./index.js";
export declare function formatTsModule(doc: TokenDocument, opts: FormatOptions): FormatResult;
//# sourceMappingURL=ts-module.d.ts.map