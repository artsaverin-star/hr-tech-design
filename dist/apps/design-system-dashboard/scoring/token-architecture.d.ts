/**
 * Token Architecture Scorer (weight: 0.20)
 *
 * Evaluates the depth and organization of the token system.
 * Checks collection organization, mode coverage, alias usage,
 * token tier depth, type distribution, and description coverage.
 */
import type { CategoryScore, DesignSystemRawData } from "./types.js";
/**
 * Token Architecture category scorer.
 * Returns the average score across all token architecture checks.
 */
export declare function scoreTokenArchitecture(data: DesignSystemRawData): CategoryScore;
//# sourceMappingURL=token-architecture.d.ts.map