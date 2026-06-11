/**
 * Design System Health Dashboard — Scoring Engine
 *
 * Main orchestrator that runs all 6 category scorers against raw Figma data
 * and produces a Lighthouse-style health score.
 *
 * Data flow:
 *   DesignSystemRawData → scoreDesignSystem() → DashboardData (JSON)
 */
import type { DashboardData, DesignSystemRawData } from "./types.js";
/**
 * Score a design system's health from raw Figma data.
 *
 * Runs all 6 category scorers and produces a weighted overall score.
 * Category weights sum to 1.0:
 *   - Naming & Semantics:   0.20
 *   - Token Architecture:   0.20
 *   - Component Metadata:   0.20
 *   - Accessibility:        0.15
 *   - Consistency:          0.15
 *   - Coverage:             0.10
 *
 * @param data - Raw Figma data (variables, collections, components, styles)
 * @returns Complete dashboard payload with overall score, categories, and summary
 */
export declare function scoreDesignSystem(data: DesignSystemRawData): DashboardData;
//# sourceMappingURL=engine.d.ts.map