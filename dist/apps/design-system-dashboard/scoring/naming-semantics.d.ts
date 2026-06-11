/**
 * Naming & Semantics Scorer (weight: 0.20)
 *
 * Checks whether design system names describe intent rather than appearance.
 * Evaluates variable naming, component naming, variant naming, and boolean
 * naming conventions against semantic best practices.
 */
import type { CategoryScore, DesignSystemRawData } from "./types.js";
/**
 * Naming & Semantics category scorer.
 * Returns the average score across all naming checks.
 */
export declare function scoreNamingSemantics(data: DesignSystemRawData): CategoryScore;
//# sourceMappingURL=naming-semantics.d.ts.map