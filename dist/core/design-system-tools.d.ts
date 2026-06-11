/**
 * Design System Kit Tool
 * MCP tool that orchestrates existing Figma API tools to produce a structured
 * design system specification — tokens, components, styles — in a single call.
 *
 * This enables AI code generation tools (Figma Make, v0, Cursor, Claude, etc.)
 * to generate code with structural fidelity to the real design system.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaAPI } from "./figma-api.js";
interface VisualSpec {
    fills?: Array<{
        type: string;
        color?: string;
        opacity?: number;
    }>;
    strokes?: Array<{
        type: string;
        color?: string;
        weight?: number;
        align?: string;
    }>;
    effects?: Array<{
        type: string;
        color?: string;
        offset?: {
            x: number;
            y: number;
        };
        radius?: number;
        spread?: number;
    }>;
    cornerRadius?: number;
    rectangleCornerRadii?: number[];
    opacity?: number;
    layout?: {
        mode?: string;
        paddingTop?: number;
        paddingRight?: number;
        paddingBottom?: number;
        paddingLeft?: number;
        itemSpacing?: number;
        primaryAxisAlign?: string;
        counterAxisAlign?: string;
    };
    typography?: {
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        lineHeight?: any;
        letterSpacing?: any;
        textAlignHorizontal?: string;
    };
}
/**
 * Extract a compact visual specification from a Figma node.
 * Captures the essential CSS-equivalent properties an AI needs to reproduce the component.
 */
export declare function extractVisualSpec(node: any): VisualSpec | undefined;
export declare function registerDesignSystemTools(server: McpServer, getFigmaAPI: () => Promise<FigmaAPI>, getCurrentUrl: () => string | null, variablesCache?: Map<string, {
    data: any;
    timestamp: number;
}>, options?: {
    isRemoteMode?: boolean;
}, getDesktopConnector?: () => Promise<any>): void;
export {};
//# sourceMappingURL=design-system-tools.d.ts.map