/**
 * tokens.config.json schema, loader, and autodiscovery for the figma-console-mcp
 * token sync engine.
 *
 * Both figma_export_tokens and figma_import_tokens read this single config so
 * follow-up calls in a project are zero-arg. Autodiscovery walks up from the
 * current working directory looking for `tokens.config.json` at each level
 * — same convention as `tsconfig.json`, `package.json`, `.eslintrc`, etc.
 */
import { z } from "zod";
import type { ConflictResolution, ExportFormat } from "./types.js";
/**
 * Schema for a single output target in `tokens.config.json`. Each entry
 * produces one or more files when figma_export_tokens runs.
 */
declare const OutputTargetSchema: z.ZodObject<{
    format: z.ZodEnum<["dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3", "scss", "less", "ts-module", "json-flat", "json-nested", "style-dictionary-v3"]>;
    /** Optional filename override. Default is derived from format + scope. */
    filename: z.ZodOptional<z.ZodString>;
    /** Output prefix applied to every token name (e.g. "ds-", "al-"). */
    prefix: z.ZodOptional<z.ZodString>;
    /** Emit one file per mode (e.g. tokens-light.css, tokens-dark.css). */
    splitByMode: z.ZodOptional<z.ZodBoolean>;
    /** Emit one file per token set / Figma collection. */
    splitByCollection: z.ZodOptional<z.ZodBoolean>;
    /**
     * If true, alias references are resolved to literal values in the output.
     * If false, aliases are preserved (default for JSON formats, forced true
     * for CSS/SCSS/Tailwind/etc. since they can't natively express aliases).
     */
    resolveAliases: z.ZodOptional<z.ZodBoolean>;
    /** Per-target transform options. Override the global defaults. */
    transforms: z.ZodOptional<z.ZodObject<{
        colorFormat: z.ZodOptional<z.ZodEnum<["hex", "hex8", "rgba", "oklch", "hsl"]>>;
        sizeUnit: z.ZodOptional<z.ZodEnum<["px", "rem", "pt", "dp"]>>;
        remBase: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
        sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
        remBase?: number | undefined;
    }, {
        colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
        sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
        remBase?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
    resolveAliases?: boolean | undefined;
    filename?: string | undefined;
    prefix?: string | undefined;
    splitByMode?: boolean | undefined;
    splitByCollection?: boolean | undefined;
    transforms?: {
        colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
        sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
        remBase?: number | undefined;
    } | undefined;
}, {
    format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
    resolveAliases?: boolean | undefined;
    filename?: string | undefined;
    prefix?: string | undefined;
    splitByMode?: boolean | undefined;
    splitByCollection?: boolean | undefined;
    transforms?: {
        colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
        sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
        remBase?: number | undefined;
    } | undefined;
}>;
export type OutputTarget = z.infer<typeof OutputTargetSchema>;
/**
 * Full schema for `tokens.config.json`. Every field is optional so the
 * minimum-viable config is `{ "figmaFile": "..." }` — the rest gets sensible
 * defaults.
 */
export declare const TokensConfigSchema: z.ZodObject<{
    /** Optional JSON Schema URL for editor autocompletion. */
    $schema: z.ZodOptional<z.ZodString>;
    /**
     * Figma file URL or fileKey. When omitted, tools fall back to the
     * currently-connected Desktop Bridge plugin's file (Local Mode) or the
     * file context bound by figma_pair_plugin (Cloud Mode).
     */
    figmaFile: z.ZodOptional<z.ZodString>;
    /** Where the canonical (committed) token sources live. */
    source: z.ZodDefault<z.ZodObject<{
        /** Directory holding the canonical token files. */
        dir: z.ZodString;
        /** Glob pattern within dir. Default: "*.tokens.json" */
        pattern: z.ZodOptional<z.ZodString>;
        /**
         * Canonical format for source files. DTCG is the recommended default;
         * Tokens Studio is supported for users who already have a `$themes.json`
         * setup (e.g. Altitude).
         */
        canonical: z.ZodDefault<z.ZodEnum<["dtcg", "tokens-studio"]>>;
    }, "strip", z.ZodTypeAny, {
        dir: string;
        canonical: "dtcg" | "tokens-studio";
        pattern?: string | undefined;
    }, {
        dir: string;
        pattern?: string | undefined;
        canonical?: "dtcg" | "tokens-studio" | undefined;
    }>>;
    /** Where build outputs (CSS, Tailwind, etc.) get written. */
    generated: z.ZodOptional<z.ZodObject<{
        dir: z.ZodDefault<z.ZodString>;
        formats: z.ZodDefault<z.ZodArray<z.ZodObject<{
            format: z.ZodEnum<["dtcg", "tokens-studio", "css-vars", "tailwind-v4", "tailwind-v3", "scss", "less", "ts-module", "json-flat", "json-nested", "style-dictionary-v3"]>;
            /** Optional filename override. Default is derived from format + scope. */
            filename: z.ZodOptional<z.ZodString>;
            /** Output prefix applied to every token name (e.g. "ds-", "al-"). */
            prefix: z.ZodOptional<z.ZodString>;
            /** Emit one file per mode (e.g. tokens-light.css, tokens-dark.css). */
            splitByMode: z.ZodOptional<z.ZodBoolean>;
            /** Emit one file per token set / Figma collection. */
            splitByCollection: z.ZodOptional<z.ZodBoolean>;
            /**
             * If true, alias references are resolved to literal values in the output.
             * If false, aliases are preserved (default for JSON formats, forced true
             * for CSS/SCSS/Tailwind/etc. since they can't natively express aliases).
             */
            resolveAliases: z.ZodOptional<z.ZodBoolean>;
            /** Per-target transform options. Override the global defaults. */
            transforms: z.ZodOptional<z.ZodObject<{
                colorFormat: z.ZodOptional<z.ZodEnum<["hex", "hex8", "rgba", "oklch", "hsl"]>>;
                sizeUnit: z.ZodOptional<z.ZodEnum<["px", "rem", "pt", "dp"]>>;
                remBase: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            }, {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }, {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        dir: string;
        formats: {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }[];
    }, {
        dir?: string | undefined;
        formats?: {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }[] | undefined;
    }>>;
    /** Mode name mappings (Figma mode name → output mode name). */
    modes: z.ZodOptional<z.ZodObject<{
        /** e.g. { "Light": "light", "Dark": "dark" } */
        map: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        /** Default mode if a token has no explicit mode (e.g. "Light"). */
        default: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        map?: Record<string, string> | undefined;
        default?: string | undefined;
    }, {
        map?: Record<string, string> | undefined;
        default?: string | undefined;
    }>>;
    /** Default conflict-resolution strategy when not specified per-call. */
    conflictResolution: z.ZodDefault<z.ZodEnum<["ask", "figma-wins", "code-wins", "skip"]>>;
    /** Behavior for tokens that exist on one side but not the other. */
    sync: z.ZodOptional<z.ZodObject<{
        onMissingInCode: z.ZodDefault<z.ZodEnum<["preserve", "delete", "warn"]>>;
        onMissingInFigma: z.ZodDefault<z.ZodEnum<["preserve", "delete", "warn"]>>;
    }, "strip", z.ZodTypeAny, {
        onMissingInCode: "warn" | "delete" | "preserve";
        onMissingInFigma: "warn" | "delete" | "preserve";
    }, {
        onMissingInCode?: "warn" | "delete" | "preserve" | undefined;
        onMissingInFigma?: "warn" | "delete" | "preserve" | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    source: {
        dir: string;
        canonical: "dtcg" | "tokens-studio";
        pattern?: string | undefined;
    };
    conflictResolution: "ask" | "figma-wins" | "code-wins" | "skip";
    sync?: {
        onMissingInCode: "warn" | "delete" | "preserve";
        onMissingInFigma: "warn" | "delete" | "preserve";
    } | undefined;
    modes?: {
        map?: Record<string, string> | undefined;
        default?: string | undefined;
    } | undefined;
    $schema?: string | undefined;
    figmaFile?: string | undefined;
    generated?: {
        dir: string;
        formats: {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }[];
    } | undefined;
}, {
    sync?: {
        onMissingInCode?: "warn" | "delete" | "preserve" | undefined;
        onMissingInFigma?: "warn" | "delete" | "preserve" | undefined;
    } | undefined;
    source?: {
        dir: string;
        pattern?: string | undefined;
        canonical?: "dtcg" | "tokens-studio" | undefined;
    } | undefined;
    modes?: {
        map?: Record<string, string> | undefined;
        default?: string | undefined;
    } | undefined;
    $schema?: string | undefined;
    figmaFile?: string | undefined;
    generated?: {
        dir?: string | undefined;
        formats?: {
            format: "dtcg" | "tokens-studio" | "css-vars" | "tailwind-v4" | "tailwind-v3" | "scss" | "less" | "ts-module" | "json-flat" | "json-nested" | "style-dictionary-v3";
            resolveAliases?: boolean | undefined;
            filename?: string | undefined;
            prefix?: string | undefined;
            splitByMode?: boolean | undefined;
            splitByCollection?: boolean | undefined;
            transforms?: {
                colorFormat?: "hex" | "hex8" | "rgba" | "oklch" | "hsl" | undefined;
                sizeUnit?: "px" | "rem" | "pt" | "dp" | undefined;
                remBase?: number | undefined;
            } | undefined;
        }[] | undefined;
    } | undefined;
    conflictResolution?: "ask" | "figma-wins" | "code-wins" | "skip" | undefined;
}>;
export type TokensConfig = z.infer<typeof TokensConfigSchema>;
/**
 * Result of running `loadTokensConfig`. Includes the resolved config plus
 * provenance info — where the file was found and the absolute project root.
 */
export interface LoadedTokensConfig {
    config: TokensConfig;
    /** Absolute path to the discovered `tokens.config.json`. */
    configPath: string;
    /** Directory containing the config file — used as the project root. */
    projectRoot: string;
}
/**
 * Walk up from `startDir` looking for `tokens.config.json`. Returns the first
 * match, or `null` if none found by the filesystem root.
 */
export declare function findTokensConfig(startDir: string): string | null;
/**
 * Load and validate `tokens.config.json`. If `explicitPath` is provided, uses
 * that; otherwise autodiscovers by walking up from `cwd` (default
 * `process.cwd()`).
 *
 * Returns `null` if no config is found AND no explicit path was given. Throws
 * if an explicit path doesn't exist, or if the discovered file fails schema
 * validation.
 */
export declare function loadTokensConfig(opts?: {
    cwd?: string;
    explicitPath?: string;
}): LoadedTokensConfig | null;
/**
 * Default config used when none is found. Drives the "no-config detected"
 * response shape from figma_export_tokens — the AI uses this to propose a
 * scaffold to the user.
 */
export declare const DEFAULT_TOKENS_CONFIG: TokensConfig;
/**
 * Build a `suggestedScaffold` payload returned when a tool is called and no
 * `tokens.config.json` exists. The AI presents this scaffold to the user,
 * writes the files via its native edit/write tools, then calls the original
 * tool again.
 */
export declare function buildSuggestedScaffold(opts: {
    projectRoot: string;
    detectedFramework?: "tailwind-v4" | "tailwind-v3" | "css" | "scss" | "ts";
}): {
    configContent: string;
    directories: string[];
    stylesheetImport: string;
    nextSteps: string;
};
/**
 * Pick the export formats from a loaded config that map to a given runtime
 * format. Used by figma_export_tokens to decide which generated files to
 * write. Returns the list verbatim if the caller passed an explicit format.
 */
export declare function resolveOutputTargets(config: TokensConfig | null, explicitFormat: ExportFormat | undefined): OutputTarget[];
/**
 * Resolve the conflict-resolution strategy. Per-call argument wins over config
 * default, which wins over the global default ("ask").
 */
export declare function resolveConflictStrategy(config: TokensConfig | null, perCall: ConflictResolution | undefined): ConflictResolution;
export {};
//# sourceMappingURL=config.d.ts.map