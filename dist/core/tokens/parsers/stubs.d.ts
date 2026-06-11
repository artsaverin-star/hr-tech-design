/**
 * Shared NotImplementedError for parser stubs.
 *
 * Only DTCG is implemented as a parser today — that's the canonical
 * round-trip format for `figma_import_tokens`. Other parsers are
 * scaffolding for potential future import-source support; the way to get
 * tokens INTO Figma now is via DTCG JSON (you can generate that JSON from
 * any source with your own tooling). The export side (Figma → code) is
 * fully covered for all 10 formats — see formatters/stubs.ts for that
 * surface.
 */
export declare class TokenFormatNotImplementedError extends Error {
    constructor(formatName: string, kind: "parser" | "formatter");
}
//# sourceMappingURL=stubs.d.ts.map