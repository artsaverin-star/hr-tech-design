/**
 * Alias reference resolution and validation.
 *
 * DTCG alias references look like `{color.primary}` or `{tier-1.color.blue.500}`.
 * They can chain (an alias can reference another alias), but cycles are an
 * error.
 *
 * This module:
 *   - Resolves an alias to its eventual literal value (for formatters that
 *     can't natively express references — CSS, SCSS, Tailwind).
 *   - Validates that every alias points to an existing token.
 *   - Detects cycles.
 */
import type { Token, TokenDocument, TokenValue } from "./types.js";
/**
 * Build a lookup map from dot-path strings (e.g. "color.primary") to Token
 * objects. Used as the index for resolveAliases().
 */
export declare function buildTokenIndex(doc: TokenDocument): Map<string, Token>;
/**
 * Resolve a single alias reference. Returns the eventual literal value, or
 * throws if the reference is unresolvable or cyclic.
 */
export declare function resolveReference(reference: string, mode: string, index: Map<string, Token>, seen?: Set<string>): TokenValue;
/**
 * Resolve an alias chain to its final literal value, walking through
 * intermediate alias hops. Returns the final TokenValue (with `literal` set
 * if resolution succeeded) or `null` if the chain ends at a cross-library
 * reference / unresolvable target / cycle.
 *
 * Used by formatters that can't natively express alias references in their
 * output (Tailwind v3, TypeScript modules, plain JSON) — those need literal
 * values at export time.
 *
 * Safer counterpart of `resolveReference` because it swallows errors
 * (unresolvable / cycle) into `null` rather than throwing; formatters can
 * then emit a comment or skip the token instead of failing the whole export.
 */
export declare function resolveAliasChain(value: TokenValue, mode: string, index: Map<string, Token>): TokenValue | null;
/**
 * Validate every alias in the document. Returns a list of error messages —
 * empty array means all aliases resolve cleanly.
 */
export declare function validateAliases(doc: TokenDocument): string[];
/**
 * Format an alias reference for DTCG output. DTCG uses `{path.to.token}`
 * syntax with curly braces.
 */
export declare function formatDtcgReference(referencePath: string[]): string;
/**
 * Parse a DTCG alias string back into a path array. Returns null if the
 * string isn't an alias reference.
 */
export declare function parseDtcgReference(s: string): string[] | null;
//# sourceMappingURL=alias-resolver.d.ts.map