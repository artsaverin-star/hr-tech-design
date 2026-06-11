/**
 * Zod schemas for the figma_export_tokens and figma_import_tokens MCP tools.
 *
 * Kept in a dedicated file because they're the AI-facing surface of the token
 * sync engine — the descriptions matter for prompt comprehension, and they
 * need to stay in sync with `src/core/tokens/types.ts` (the internal model).
 */
import { z } from "zod";
/**
 * Output format enum mirrors `ExportFormat` from `./types.ts`. Listed in the
 * same priority order — DTCG and Tokens Studio first as the canonical JSON
 * outputs, then CSS-family formats, then code modules, then back-compat.
 */
export declare const ExportFormatSchema: z.ZodEnum<["dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3", "scss", "less", "ts-module", "json-flat", "json-nested", "style-dictionary-v3"]>;
export declare const ImportFormatSchema: z.ZodEnum<["auto", "dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3-config", "scss", "style-dictionary-v3", "json-flat", "json-nested"]>;
export declare const SyncStrategySchema: z.ZodEnum<["merge", "replace", "dry-run"]>;
export declare const ConflictResolutionSchema: z.ZodEnum<["ask", "figma-wins", "code-wins", "skip"]>;
/**
 * Schema for figma_export_tokens. Most fields are optional — the typical call
 * is zero-arg, picking everything up from `tokens.config.json` autodiscovery.
 */
export declare const ExportTokensInputSchema: z.ZodObject<{
    scope: z.ZodOptional<z.ZodEnum<["file", "collection"]>>;
    collectionIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    modes: z.ZodOptional<z.ZodUnion<[z.ZodArray<z.ZodString, "many">, z.ZodLiteral<"all">]>>;
    format: z.ZodOptional<z.ZodEnum<["dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3", "scss", "less", "ts-module", "json-flat", "json-nested", "style-dictionary-v3"]>>;
    outputPath: z.ZodOptional<z.ZodString>;
    configPath: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodEnum<["merge", "replace", "dry-run"]>>;
    prefix: z.ZodOptional<z.ZodString>;
    resolveAliases: z.ZodOptional<z.ZodBoolean>;
    splitByMode: z.ZodOptional<z.ZodBoolean>;
    splitByCollection: z.ZodOptional<z.ZodBoolean>;
    colorFormat: z.ZodOptional<z.ZodEnum<["hex", "hex8", "rgba", "oklch", "hsl"]>>;
    sizeUnit: z.ZodOptional<z.ZodEnum<["px", "rem", "pt", "dp"]>>;
    remBase: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3" | undefined;
    resolveAliases?: boolean | undefined;
    outputPath?: string | undefined;
    modes?: string[] | "all" | undefined;
    prefix?: string | undefined;
    splitByMode?: boolean | undefined;
    splitByCollection?: boolean | undefined;
    colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
    sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
    remBase?: number | undefined;
    configPath?: string | undefined;
    scope?: "collection" | "file" | undefined;
    collectionIds?: string[] | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
}, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3" | undefined;
    resolveAliases?: boolean | undefined;
    outputPath?: string | undefined;
    modes?: string[] | "all" | undefined;
    prefix?: string | undefined;
    splitByMode?: boolean | undefined;
    splitByCollection?: boolean | undefined;
    colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
    sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
    remBase?: number | undefined;
    configPath?: string | undefined;
    scope?: "collection" | "file" | undefined;
    collectionIds?: string[] | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
}>;
export type ExportTokensInput = z.infer<typeof ExportTokensInputSchema>;
/**
 * Schema for figma_import_tokens. Mirrors export's shape on the inverse
 * direction: instead of producing files, this consumes payloads or files and
 * pushes the diff to Figma.
 */
export declare const ImportTokensInputSchema: z.ZodEffects<z.ZodObject<{
    format: z.ZodOptional<z.ZodEnum<["auto", "dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3-config", "scss", "style-dictionary-v3", "json-flat", "json-nested"]>>;
    payload: z.ZodOptional<z.ZodString>;
    files: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        path: string;
    }, {
        content: string;
        path: string;
    }>, "many">>;
    configPath: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodEnum<["merge", "replace", "dry-run"]>>;
    collectionMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    modeMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    prefix: z.ZodOptional<z.ZodString>;
    onConflict: z.ZodOptional<z.ZodEnum<["ask", "figma-wins", "code-wins", "skip"]>>;
    dryRun: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "scss" | "json-flat" | "json-nested" | "style-dictionary-v3" | "auto" | "tailwind-v3-config" | undefined;
    payload?: string | undefined;
    prefix?: string | undefined;
    configPath?: string | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
    files?: {
        content: string;
        path: string;
    }[] | undefined;
    collectionMapping?: Record<string, string> | undefined;
    modeMapping?: Record<string, string> | undefined;
    onConflict?: "ask" | "figma-wins" | "code-wins" | "skip" | undefined;
    dryRun?: boolean | undefined;
}, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "scss" | "json-flat" | "json-nested" | "style-dictionary-v3" | "auto" | "tailwind-v3-config" | undefined;
    payload?: string | undefined;
    prefix?: string | undefined;
    configPath?: string | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
    files?: {
        content: string;
        path: string;
    }[] | undefined;
    collectionMapping?: Record<string, string> | undefined;
    modeMapping?: Record<string, string> | undefined;
    onConflict?: "ask" | "figma-wins" | "code-wins" | "skip" | undefined;
    dryRun?: boolean | undefined;
}>, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "scss" | "json-flat" | "json-nested" | "style-dictionary-v3" | "auto" | "tailwind-v3-config" | undefined;
    payload?: string | undefined;
    prefix?: string | undefined;
    configPath?: string | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
    files?: {
        content: string;
        path: string;
    }[] | undefined;
    collectionMapping?: Record<string, string> | undefined;
    modeMapping?: Record<string, string> | undefined;
    onConflict?: "ask" | "figma-wins" | "code-wins" | "skip" | undefined;
    dryRun?: boolean | undefined;
}, {
    format?: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "scss" | "json-flat" | "json-nested" | "style-dictionary-v3" | "auto" | "tailwind-v3-config" | undefined;
    payload?: string | undefined;
    prefix?: string | undefined;
    configPath?: string | undefined;
    strategy?: "replace" | "merge" | "dry-run" | undefined;
    files?: {
        content: string;
        path: string;
    }[] | undefined;
    collectionMapping?: Record<string, string> | undefined;
    modeMapping?: Record<string, string> | undefined;
    onConflict?: "ask" | "figma-wins" | "code-wins" | "skip" | undefined;
    dryRun?: boolean | undefined;
}>;
export type ImportTokensInput = z.infer<typeof ImportTokensInputSchema>;
//# sourceMappingURL=schemas.d.ts.map