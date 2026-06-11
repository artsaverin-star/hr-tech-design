/**
 * Figma REST API Client
 * Handles HTTP calls to Figma's REST API for file data, variables, components, and styles
 */
/**
 * Figma API Client Configuration
 */
export interface FigmaAPIConfig {
    accessToken: string;
}
/**
 * Extract file key from Figma URL
 * @example https://www.figma.com/design/abc123/My-File -> abc123
 */
export declare function extractFileKey(url: string): string | null;
/**
 * Information extracted from a Figma URL
 * Includes file key, optional branch ID, and optional node ID
 */
export interface FigmaUrlInfo {
    fileKey: string;
    branchId?: string;
    nodeId?: string;
}
/**
 * Extract comprehensive URL info including branch and node IDs
 * Supports both URL formats:
 * - Path-based: /design/{fileKey}/branch/{branchKey}/{fileName}
 * - Query-based: /design/{fileKey}/{fileName}?branch-id={branchId}
 *
 * @example https://www.figma.com/design/abc123/branch/xyz789/My-File?node-id=1-2
 *   -> { fileKey: 'abc123', branchId: 'xyz789', nodeId: '1:2' }
 * @example https://www.figma.com/design/abc123/My-File?branch-id=xyz789&node-id=1-2
 *   -> { fileKey: 'abc123', branchId: 'xyz789', nodeId: '1:2' }
 */
export declare function extractFigmaUrlInfo(url: string): FigmaUrlInfo | null;
/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param label Label for error message
 * @returns Promise that rejects if timeout exceeded
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T>;
/**
 * Figma API Client
 * Makes authenticated requests to Figma REST API
 */
export declare class FigmaAPI {
    private accessToken;
    constructor(config: FigmaAPIConfig);
    /**
     * Make authenticated request to Figma API
     */
    private request;
    /**
     * GET /v1/files/:file_key
     * Get full file data including document tree, components, and styles
     */
    getFile(fileKey: string, options?: {
        version?: string;
        ids?: string[];
        depth?: number;
        geometry?: 'paths' | 'screen';
        plugin_data?: string;
        branch_data?: boolean;
    }): Promise<any>;
    /**
     * Resolve a branch key from a branch ID
     * If branchId is provided, fetches branch data and returns the branch's unique key
     * Otherwise returns the main file key unchanged
     * @param fileKey The main file key from the URL
     * @param branchId Optional branch ID from URL query param (branch-id)
     * @returns The effective file key to use for API calls (branch key if on branch, otherwise fileKey)
     */
    getBranchKey(fileKey: string, branchId?: string): Promise<string>;
    /**
     * GET /v1/files/:file_key/variables/local
     * Get local variables (design tokens) from a file
     */
    getLocalVariables(fileKey: string): Promise<any>;
    /**
     * GET /v1/files/:file_key/variables/published
     * Get published variables from a file
     */
    getPublishedVariables(fileKey: string): Promise<any>;
    /**
     * GET /v1/files/:file_key/nodes
     * Get specific nodes by ID
     */
    getNodes(fileKey: string, nodeIds: string[], options?: {
        version?: string;
        depth?: number;
        geometry?: 'paths' | 'screen';
        plugin_data?: string;
    }): Promise<any>;
    /**
     * GET /v1/files/:file_key/styles
     * Get styles from a file
     */
    getStyles(fileKey: string): Promise<any>;
    /**
     * GET /v1/files/:file_key/components
     * Get components from a file
     */
    getComponents(fileKey: string): Promise<any>;
    /**
     * GET /v1/files/:file_key/component_sets
     * Get component sets (variants) from a file
     */
    getComponentSets(fileKey: string): Promise<any>;
    /**
     * GET /v1/components/:key
     * Get metadata for a single published component by its key.
     * Returns { status, error, meta: PublishedComponent } where meta includes
     * file_key, node_id, name, description, containing_frame, user, etc.
     * Use this to resolve a componentKey (from search results) to its source file.
     */
    getComponentByKey(key: string): Promise<any>;
    /**
     * GET /v1/component_sets/:key
     * Get metadata for a single published component set (variant container) by its key.
     * Returns { status, error, meta: PublishedComponentSet } with the same fields
     * as getComponentByKey. The node_id points to the parent COMPONENT_SET node.
     */
    getComponentSetByKey(key: string): Promise<any>;
    /**
     * GET /v1/images/:file_key
     * Renders images for specified nodes
     * @param fileKey - The file key
     * @param nodeIds - Node IDs to render (single string or array)
     * @param options - Rendering options
     * @returns Map of node IDs to image URLs (URLs expire after 30 days)
     */
    getImages(fileKey: string, nodeIds: string | string[], options?: {
        scale?: number;
        format?: 'png' | 'jpg' | 'svg' | 'pdf';
        svg_outline_text?: boolean;
        svg_include_id?: boolean;
        svg_include_node_id?: boolean;
        svg_simplify_stroke?: boolean;
        contents_only?: boolean;
    }): Promise<{
        images: Record<string, string | null>;
    }>;
    /**
     * GET /v1/files/:file_key/comments
     * Get comments on a file
     */
    getComments(fileKey: string, options?: {
        as_md?: boolean;
    }): Promise<any>;
    /**
     * POST /v1/files/:file_key/comments
     * Post a comment on a file
     */
    postComment(fileKey: string, message: string, clientMeta?: {
        node_id?: string;
        node_offset?: {
            x: number;
            y: number;
        };
    }, commentId?: string): Promise<any>;
    /**
     * DELETE /v1/files/:file_key/comments/:comment_id
     * Delete a comment on a file
     */
    deleteComment(fileKey: string, commentId: string): Promise<any>;
    /**
     * GET /v1/files/:file_key/versions
     * List a file's version history. Cursor-style pagination via before/after
     * (cursors are version IDs). Response includes pagination.prev_page and
     * pagination.next_page as full URLs — Figma recommends following those
     * directly rather than reconstructing cursors. Requires the
     * `file_versions:read` OAuth scope (or PAT "Versions" Read permission).
     */
    getFileVersions(fileKey: string, options?: {
        page_size?: number;
        before?: string;
        after?: string;
    }): Promise<{
        versions: Array<{
            id: string;
            created_at: string;
            label: string;
            description: string;
            user: {
                id: string;
                handle: string;
                img_url: string;
            };
        }>;
        pagination?: {
            prev_page?: string;
            next_page?: string;
        };
    }>;
    /**
     * Helper: Get all design tokens (variables) with formatted output
     * Both local and published can fail gracefully (e.g., 403 without Enterprise plan)
     */
    getAllVariables(fileKey: string): Promise<{
        local: any;
        published: any;
        localError?: string;
        publishedError?: string;
    }>;
    /**
     * Helper: Get component metadata with properties
     */
    getComponentData(fileKey: string, nodeId: string, depth?: number): Promise<any>;
    /**
     * Helper: Search for components by name
     */
    searchComponents(fileKey: string, searchTerm: string): Promise<any[]>;
}
/**
 * Helper function to format variables for display
 */
export declare function formatVariables(variablesData: any): {
    collections: any[];
    variables: any[];
    summary: {
        totalCollections: number;
        totalVariables: number;
        variablesByType: Record<string, number>;
    };
};
/**
 * Helper function to format component data for display
 */
export declare function formatComponentData(componentNode: any): {
    id: string;
    name: string;
    type: string;
    description?: string;
    descriptionMarkdown?: string;
    properties?: any;
    children?: any[];
    bounds?: any;
    fills?: any[];
    strokes?: any[];
    effects?: any[];
};
//# sourceMappingURL=figma-api.d.ts.map