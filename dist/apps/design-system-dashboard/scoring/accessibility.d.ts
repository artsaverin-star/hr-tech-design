/**
 * Accessibility Scorer (weight: 0.15)
 *
 * Checks accessibility-related signals in the design system.
 * Evaluates color contrast ratios, state variant coverage,
 * and semantic color naming patterns.
 */
import type { CategoryScore, DesignSystemRawData } from "./types.js";
/**
 * Accessibility category scorer.
 * Returns the average score across all accessibility checks.
 */
export declare function scoreAccessibility(data: DesignSystemRawData): CategoryScore;
//# sourceMappingURL=accessibility.d.ts.map