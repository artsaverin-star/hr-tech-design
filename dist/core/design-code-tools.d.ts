/**
 * Design-Code Parity Checker & Documentation Generator
 * MCP tools for comparing Figma design specs with code-side data
 * and generating platform-agnostic component documentation.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
import type { CompanyDocsContentEntry } from "./types/design-code.js";
export { figmaRGBAToHex, normalizeColor, numericClose } from "./diff/property-compare.js";
/** Calculate parity score from discrepancy counts */
export declare function calculateParityScore(critical: number, major: number, minor: number, info: number): number;
/** Split markdown by H2 headers for platforms that need chunking */
export declare function chunkMarkdownByHeaders(markdown: string): Array<{
    heading: string;
    content: string;
}>;
/**
 * Clean a raw Figma variant name like "Type=Image, Size=12" into "Image / 12".
 * Extracts just the values from "Key=Value" pairs, joined by " / ".
 */
export declare function cleanVariantName(rawName: string): string;
/** Structured content extracted from a Figma component description */
interface ParsedDescription {
    /** The main overview/summary text */
    overview: string;
    /** "When to Use" bullet points */
    whenToUse: string[];
    /** "When NOT to Use" bullet points */
    whenNotToUse: string[];
    /** Content guidelines sections (title text, description text, etc.) */
    contentGuidelines: Array<{
        heading: string;
        items: string[];
    }>;
    /** Accessibility notes */
    accessibilityNotes: string[];
    /** Any remaining unclassified content */
    additionalNotes: string[];
}
/**
 * Parse a Figma component description into structured sections.
 * Handles markdown-formatted descriptions with headers, bullet points, etc.
 */
export declare function parseComponentDescription(description: string): ParsedDescription;
/** Color data collected from a specific variant */
interface VariantColorData {
    variantName: string;
    fills: Array<{
        hex: string;
        nodeName: string;
        variableId?: string;
        variableName?: string;
    }>;
    strokes: Array<{
        hex: string;
        nodeName: string;
        variableId?: string;
        variableName?: string;
    }>;
    textColors: Array<{
        hex: string;
        nodeName: string;
        variableId?: string;
        variableName?: string;
    }>;
    icons: Array<{
        name: string;
        type: string;
    }>;
}
/** Typography data from a text node */
interface TextStyleData {
    nodeName: string;
    fontFamily: string;
    fontWeight: number;
    fontWeightName: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    variableBindings?: Record<string, string>;
}
/**
 * Collect color data from all variants in a COMPONENT_SET.
 * For single COMPONENTs, returns data for just that component.
 */
export declare function collectAllVariantData(node: any, varNameMap: Map<string, string>): VariantColorData[];
/**
 * Collect typography data from all text nodes in a component tree.
 */
export declare function collectTypographyData(node: any, depth?: number, maxDepth?: number): TextStyleData[];
/**
 * Build an anatomy tree representation from a Figma node structure.
 * Returns a formatted string showing the component's nested structure.
 */
export declare function buildAnatomyTree(node: any, depth?: number, maxDepth?: number): string;
/**
 * Resolve the node to use for visual/spacing/typography comparisons.
 * COMPONENT_SET frames have container-level styling (Figma's purple dashed stroke,
 * default cornerRadius: 5, organizational padding) that are NOT actual design specs.
 * The real design properties live on the child COMPONENT variants.
 * Returns the default variant (first child) for COMPONENT_SET, or the node itself otherwise.
 */
export declare function resolveVisualNode(node: any): any;
/** Detect if a node name is a Figma variant pattern like "Variant=Default, State=Hover, Size=lg" */
export declare function isVariantName(name: string): boolean;
/** Sanitize a component name for use as a file path */
export declare function sanitizeComponentName(name: string): string;
/** Convert generated markdown into a CompanyDocsMCP-compatible content entry */
export declare function toCompanyDocsEntry(markdown: string, componentName: string, figmaUrl: string, systemName?: string): CompanyDocsContentEntry;
export declare function registerDesignCodeTools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>, getCurrentUrl: () => string | null, variablesCache?: Map<string, {
    data: any;
    timestamp: number;
}>, options?: {
    isRemoteMode?: boolean;
}, getDesktopConnector?: () => Promise<any>): void;
//# sourceMappingURL=design-code-tools.d.ts.map