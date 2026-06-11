/**
 * Formatter dispatcher. Each formatter converts our canonical internal
 * TokenDocument into a specific output format (DTCG JSON, CSS custom
 * properties, Tailwind v4 @theme, SCSS, etc.).
 */
import type { ExportFormat, TokenDocument } from "../types.js";
import type { OutputTarget } from "../config.js";
export interface FormatOptions {
    /** Output target options merged from per-call args and tokens.config.json. */
    target: OutputTarget;
    /** Project root path. Resolves output filenames relative to this. */
    projectRoot?: string;
}
export interface FormatResult {
    /**
     * Output files to write. Single-file formats return one entry; split formats
     * (splitByMode, splitByCollection) return one per file.
     */
    files: Array<{
        /** Relative path from the configured generated.dir or projectRoot. */
        path: string;
        /** UTF-8 content. */
        content: string;
    }>;
    /** Format-specific warnings (e.g. "composite typography expanded to primitives"). */
    warnings: string[];
}
export declare function format(doc: TokenDocument, options: FormatOptions): FormatResult;
export type { ExportFormat };
//# sourceMappingURL=index.d.ts.map