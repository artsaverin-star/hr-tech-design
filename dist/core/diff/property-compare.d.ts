/**
 * Property comparison primitives.
 *
 * Pure helper functions used by both the design-code parity tools and
 * the version diff engine. Moved here from src/core/design-code-tools.ts
 * so multiple consumers can share without circular dependencies.
 */
/** Convert Figma RGBA (0-1 floats) to hex string */
export declare function figmaRGBAToHex(color: {
    r: number;
    g: number;
    b: number;
    a?: number;
}): string;
/** Normalize a color string for comparison (uppercase hex without alpha if fully opaque) */
export declare function normalizeColor(color: string): string;
/** Compare numeric values with a tolerance */
export declare function numericClose(a: number, b: number, tolerance?: number): boolean;
//# sourceMappingURL=property-compare.d.ts.map