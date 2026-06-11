/**
 * Design System Dashboard — Shared Types
 *
 * Defines the JSON contract between the scoring engine (server-side),
 * the server registration (tools), and the UI (client-side rendering).
 */
export type FindingSeverity = "pass" | "warning" | "fail" | "info";
/** A single audit check result. */
export interface Finding {
    id: string;
    label: string;
    score: number;
    severity: FindingSeverity;
    tooltip?: string;
    details?: string;
    examples?: string[];
    locations?: Array<{
        name: string;
        collection?: string;
        nodeId?: string;
        type?: string;
    }>;
}
/** Build a map of collection ID → collection name for location context. */
export declare function buildCollectionNameMap(collections: any[]): Map<string, string>;
/** A scored category (one of the 6 gauge rings). */
export interface CategoryScore {
    id: string;
    label: string;
    shortLabel: string;
    score: number;
    weight: number;
    findings: Finding[];
}
/** Complete dashboard payload sent to the UI. */
export interface DashboardData {
    overall: number;
    status: "good" | "needs-work" | "poor";
    categories: CategoryScore[];
    summary: string[];
    meta: {
        componentCount: number;
        variableCount: number;
        collectionCount: number;
        styleCount: number;
        componentSetCount: number;
        standaloneCount: number;
        variantCount: number;
        timestamp: number;
    };
    fileInfo?: FileInfo;
    dataAvailability?: DataAvailability;
}
/** File metadata from Figma REST API. */
export interface FileInfo {
    name: string;
    lastModified: string;
    version?: string;
    thumbnailUrl?: string;
}
/** Tracks which data sources were successfully fetched. */
export interface DataAvailability {
    variables: boolean;
    collections: boolean;
    components: boolean;
    styles: boolean;
    variableError?: string;
}
/** Raw data fetched from Figma tools, passed into the scoring engine. */
export interface DesignSystemRawData {
    variables: any[];
    collections: any[];
    components: any[];
    styles: any[];
    componentSets: any[];
    fileInfo?: FileInfo;
    dataAvailability?: DataAvailability;
}
/** Each category module exports a function matching this signature. */
export type CategoryScorer = (data: DesignSystemRawData) => CategoryScore;
export declare const THRESHOLDS: {
    readonly GOOD: 90;
    readonly NEEDS_WORK: 50;
};
export declare function getStatus(score: number): DashboardData["status"];
export declare function getSeverity(score: number): FindingSeverity;
/** Clamp a number to 0-100. */
export declare function clamp(value: number): number;
//# sourceMappingURL=types.d.ts.map