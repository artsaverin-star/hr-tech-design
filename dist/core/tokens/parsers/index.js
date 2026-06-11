/**
 * Parser dispatcher. Each parser converts an input format into our canonical
 * internal TokenDocument model.
 */
import { parseDtcg } from "./dtcg.js";
import { parseTokensStudio } from "./tokens-studio.js";
import { parseCssVars } from "./css-vars.js";
import { parseTailwindV4 } from "./tailwind-v4.js";
import { parseTailwindV3Config } from "./tailwind-v3.js";
import { parseScss } from "./scss.js";
import { parseStyleDictionaryV3 } from "./style-dictionary-v3.js";
import { parseJsonFlat, parseJsonNested } from "./json.js";
/**
 * Parse a payload using the given format. When format is 'auto', sniffs the
 * payload to pick the right parser.
 */
export function parse(format, input) {
    const resolved = format === "auto" ? detectFormat(input) : format;
    switch (resolved) {
        case "dtcg":
            return parseDtcg(input);
        case "tokens-studio":
            return parseTokensStudio(input);
        case "css-vars":
            return parseCssVars(input);
        case "tailwind-v4":
            return parseTailwindV4(input);
        case "tailwind-v3-config":
            return parseTailwindV3Config(input);
        case "scss":
            return parseScss(input);
        case "style-dictionary-v3":
            return parseStyleDictionaryV3(input);
        case "json-flat":
            return parseJsonFlat(input);
        case "json-nested":
            return parseJsonNested(input);
        default: {
            const _exhaustive = resolved;
            throw new Error(`[figma-console-mcp] Unknown import format: ${_exhaustive}`);
        }
    }
}
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
export function detectFormat(input) {
    const trimmed = input.payload.trim();
    // JSON-shape sniffing
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (hasDtcgMarkers(parsed))
                return "dtcg";
            if (hasTokensStudioMarkers(parsed))
                return "tokens-studio";
            if (hasStyleDictionaryV3Markers(parsed))
                return "style-dictionary-v3";
            if (looksFlat(parsed))
                return "json-flat";
            return "json-nested";
        }
        catch {
            // Not actually JSON — fall through to text sniffing.
        }
    }
    // Tailwind v4: presence of `@theme` directive
    if (trimmed.includes("@theme"))
        return "tailwind-v4";
    // CSS custom properties
    if (/--[a-z][a-z0-9_-]*\s*:/i.test(trimmed))
        return "css-vars";
    // SCSS variables
    if (/^\s*\$[a-z][a-z0-9_-]*\s*:/im.test(trimmed))
        return "scss";
    // File extension fallback
    if (input.sourcePath) {
        if (input.sourcePath.endsWith(".css"))
            return "css-vars";
        if (input.sourcePath.endsWith(".scss"))
            return "scss";
        if (input.sourcePath.endsWith(".json"))
            return "json-nested";
    }
    throw new Error(`[figma-console-mcp] Unable to auto-detect format for ${input.sourcePath ?? "payload"}. Pass an explicit format to figma_import_tokens.`);
}
function hasDtcgMarkers(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (key === "$value" || key === "$type")
            return true;
        if (val && typeof val === "object" && hasDtcgMarkers(val))
            return true;
    }
    return false;
}
function hasTokensStudioMarkers(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    const top = obj;
    // Tokens Studio's signature: presence of $themes or $metadata at the root,
    // or selectedTokenSets nested inside the document.
    return ("$themes" in top ||
        "$metadata" in top ||
        JSON.stringify(top).includes("selectedTokenSets"));
}
function hasStyleDictionaryV3Markers(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    // SD v3 uses bare "value" and "type" fields (no $ prefix) on leaf nodes.
    for (const val of Object.values(obj)) {
        if (val && typeof val === "object") {
            const inner = val;
            if ("value" in inner && ("type" in inner || typeof inner.value !== "object")) {
                return true;
            }
            if (hasStyleDictionaryV3Markers(val))
                return true;
        }
    }
    return false;
}
function looksFlat(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    return Object.values(obj).every((v) => typeof v !== "object" || v === null);
}
//# sourceMappingURL=index.js.map