/**
 * Consistency Scorer (weight: 0.15)
 *
 * Checks pattern uniformity across the design system.
 * Evaluates naming delimiter consistency, casing consistency,
 * size value consistency, and mode naming consistency.
 */
import type { CategoryScore, DesignSystemRawData } from "./types.js";
/**
 * Consistency category scorer.
 * Returns the average score across all consistency checks.
 */
export declare function scoreConsistency(data: DesignSystemRawData): CategoryScore;
//# sourceMappingURL=consistency.d.ts.map