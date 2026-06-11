/**
 * Component Metadata Scorer (weight: 0.20)
 *
 * Checks component quality and completeness within the design system.
 * Evaluates description presence, description quality, property completeness,
 * variant structure, and category organization.
 *
 * Scores against "scorable units" (component sets + standalone components)
 * rather than raw variant count to avoid inflated totals.
 */
import type { CategoryScore, DesignSystemRawData } from "./types.js";
export interface ComponentClassification {
    standalone: any[];
    variants: any[];
    componentSets: any[];
    scorableUnits: any[];
}
/**
 * Classify components into standalone, variants, and component sets.
 * Scoring evaluates `scorableUnits` (standalone + componentSets)
 * instead of the raw component list which double-counts variants.
 */
export declare function classifyComponents(data: DesignSystemRawData): ComponentClassification;
/**
 * Component Metadata category scorer.
 * Returns the average score across all component metadata checks.
 */
export declare function scoreComponentMetadata(data: DesignSystemRawData): CategoryScore;
//# sourceMappingURL=component-metadata.d.ts.map