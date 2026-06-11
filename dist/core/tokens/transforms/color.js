/**
 * Color value transforms. Convert between hex, hex8 (with alpha), rgba, oklch,
 * and hsl representations. Stub — DTCG and CSS-vars output preserve source
 * values; format-specific transforms will land alongside the Tailwind v4 /
 * SCSS formatters.
 */
export const colorToFormat = (value, _token, _opts) => {
    // Pass through. The DTCG and CSS-vars formatters don't need transforms —
    // they preserve / format source values inline. Hex↔oklch↔rgba etc. will be
    // implemented when format-specific output requires conversion.
    return value;
};
//# sourceMappingURL=color.js.map