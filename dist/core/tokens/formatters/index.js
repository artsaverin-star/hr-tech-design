/**
 * Formatter dispatcher. Each formatter converts our canonical internal
 * TokenDocument into a specific output format (DTCG JSON, CSS custom
 * properties, Tailwind v4 @theme, SCSS, etc.).
 */
import { formatDtcg } from "./dtcg.js";
import { formatTokensStudio } from "./tokens-studio.js";
import { formatCssVars } from "./css-vars.js";
import { formatTailwindV4 } from "./tailwind-v4.js";
import { formatTailwindV3 } from "./tailwind-v3.js";
import { formatScss } from "./scss.js";
import { formatLess } from "./less.js";
import { formatTsModule } from "./ts-module.js";
import { formatJsonFlat, formatJsonNested } from "./json.js";
import { formatStyleDictionaryV3 } from "./style-dictionary-v3.js";
export function format(doc, options) {
    switch (options.target.format) {
        case "dtcg":
            return formatDtcg(doc, options);
        case "tokens-studio":
            return formatTokensStudio(doc, options);
        case "css-vars":
            return formatCssVars(doc, options);
        case "tailwind-v4":
            return formatTailwindV4(doc, options);
        case "tailwind-v3":
            return formatTailwindV3(doc, options);
        case "scss":
            return formatScss(doc, options);
        case "less":
            return formatLess(doc, options);
        case "ts-module":
            return formatTsModule(doc, options);
        case "json-flat":
            return formatJsonFlat(doc, options);
        case "json-nested":
            return formatJsonNested(doc, options);
        case "style-dictionary-v3":
            return formatStyleDictionaryV3(doc, options);
        default: {
            const _exhaustive = options.target.format;
            throw new Error(`[figma-console-mcp] Unknown export format: ${_exhaustive}`);
        }
    }
}
//# sourceMappingURL=index.js.map