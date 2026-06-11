/**
 * Parser dispatcher. Each parser converts an input format into our canonical
 * internal TokenDocument model.
 */
import type { ImportFormat, TokenDocument } from "../types.js";
export interface ParseInput {
    /** Raw text content of the source file. */
    payload: string;
    /** Optional file path — used for auto-detection by extension and for error messages. */
    sourcePath?: string;
}
export interface ParseResult {
    document: TokenDocument;
    /** Format the parser used (resolved from 'auto' when applicable). */
    detectedFormat: Exclude<ImportFormat, "auto">;
    /** Non-fatal warnings to surface to the user (unknown $type, etc.). */
    warnings: string[];
}
/**
 * Parse a payload using the given format. When format is 'auto', sniffs the
 * payload to pick the right parser.
 */
export declare function parse(format: ImportFormat, input: ParseInput): ParseResult;
/**
 * Sniff the payload to determine its format. Order matters — earlier checks
 * are higher-priority signals.
 *
 *  1. JSON content with DTCG markers ($value/$type at any depth)
 *  2. JSON content with Tokens Studio markers ($themes.json or $metadata)
 *  3. JSON content with Style Dictionary v3 markers (bare value/type)
 *  4. Tailwind v4 `@theme` block
 *  5. CSS custom properties (`:root { --foo: bar; }`)
 *  6. SCSS variables (`$foo: bar;`)
 *  7. File extension as a last-resort hint
 */
export declare function detectFormat(input: ParseInput): Exclude<ImportFormat, "auto">;
//# sourceMappingURL=index.d.ts.map