/**
 * Code-side accessibility scanning via axe-core + JSDOM.
 *
 * Delegates all rule logic to axe-core (Deque) — the MCP never owns
 * a rule database. JSDOM provides a lightweight DOM for structural checks
 * (~50 rules: ARIA, semantics, alt text, form labels, headings, landmarks).
 *
 * Visual rules (color contrast, focus-visible) are NOT available via JSDOM —
 * those are handled by the design-side figma_lint_design tool.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Extract a CodeSpec.accessibility object from HTML + axe-core results.
 * This bridges Phase 3 (code scanning) → Phase 4 (parity comparison).
 *
 * Parses the HTML to extract semantic element, ARIA attributes, and states.
 * Uses axe-core results to infer what the code supports.
 */
export declare function axeResultsToCodeSpec(html: string, axeResults: any): Record<string, any>;
export declare function registerAccessibilityTools(server: McpServer): void;
//# sourceMappingURL=accessibility-tools.d.ts.map