/**
 * Figma REST API Client
 * Handles HTTP calls to Figma's REST API for file data, variables, components, and styles
 */
import { createChildLogger } from './logger.js';
const logger = createChildLogger({ component: 'figma-api' });
const FIGMA_API_BASE = 'https://api.figma.com/v1';
/**
 * Extract file key from Figma URL
 * @example https://www.figma.com/design/abc123/My-File -> abc123
 */
export function extractFileKey(url) {
    try {
        const urlObj = new URL(url);
        // Match patterns like /design/FILE_KEY or /file/FILE_KEY
        const match = urlObj.pathname.match(/\/(design|file)\/([a-zA-Z0-9]+)/);
        return match ? match[2] : null;
    }
    catch (error) {
        logger.error({ error, url }, 'Failed to extract file key from URL');
        return null;
    }
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
export function extractFigmaUrlInfo(url) {
    try {
        const urlObj = new URL(url);
        // First try: Path-based branch format /design/{fileKey}/branch/{branchKey}/{fileName}
        const branchPathMatch = urlObj.pathname.match(/\/(design|file)\/([a-zA-Z0-9]+)\/branch\/([a-zA-Z0-9]+)/);
        if (branchPathMatch) {
            const fileKey = branchPathMatch[2];
            const branchId = branchPathMatch[3];
            const nodeIdParam = urlObj.searchParams.get('node-id');
            const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ':') : undefined;
            return { fileKey, branchId, nodeId };
        }
        // Second try: Standard format /design/{fileKey}/{fileName} with optional ?branch-id=
        const standardMatch = urlObj.pathname.match(/\/(design|file)\/([a-zA-Z0-9]+)/);
        if (!standardMatch)
            return null;
        const fileKey = standardMatch[2];
        const branchId = urlObj.searchParams.get('branch-id') || undefined;
        const nodeIdParam = urlObj.searchParams.get('node-id');
        // Convert node-id from URL format (1-2) to Figma format (1:2)
        const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ':') : undefined;
        return { fileKey, branchId, nodeId };
    }
    catch (error) {
        logger.error({ error, url }, 'Failed to extract Figma URL info');
        return null;
    }
}
/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param label Label for error message
 * @returns Promise that rejects if timeout exceeded
 */
export function withTimeout(promise, ms, label) {
    const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        // Ensure timeout is cleared if promise resolves/rejects first.
        // The .catch() prevents an unhandled rejection when the original
        // promise rejects — .finally() returns a new promise that inherits
        // the rejection, and without .catch() it becomes unhandled.
        promise.finally(() => clearTimeout(timeoutId)).catch(() => { });
    });
    return Promise.race([promise, timeoutPromise]);
}
/**
 * Figma API Client
 * Makes authenticated requests to Figma REST API
 */
export class FigmaAPI {
    constructor(config) {
        this.accessToken = config.accessToken;
    }
    /**
     * Make authenticated request to Figma API
     */
    async request(endpoint, options = {}) {
        const url = `${FIGMA_API_BASE}${endpoint}`;
        // Detect token type and use appropriate authentication header
        // OAuth tokens start with 'figu_' and require Authorization: Bearer header
        // Personal Access Tokens use X-Figma-Token header
        const isOAuthToken = this.accessToken.startsWith('figu_');
        logger.debug({ url, authMethod: isOAuthToken ? 'Bearer' : 'X-Figma-Token' }, 'Making Figma API request');
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        };
        // Add authentication header based on token type
        if (isOAuthToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        else {
            headers['X-Figma-Token'] = this.accessToken;
        }
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, statusText: response.statusText, body: errorText }, 'Figma API request failed');
            throw new Error(`Figma API error (${response.status}): ${errorText}`);
        }
        const data = await response.json();
        return data;
    }
    /**
     * GET /v1/files/:file_key
     * Get full file data including document tree, components, and styles
     */
    async getFile(fileKey, options) {
        let endpoint = `/files/${fileKey}`;
        const params = new URLSearchParams();
        if (options?.version)
            params.append('version', options.version);
        if (options?.ids)
            params.append('ids', options.ids.join(','));
        if (options?.depth !== undefined)
            params.append('depth', options.depth.toString());
        if (options?.geometry)
            params.append('geometry', options.geometry);
        if (options?.plugin_data)
            params.append('plugin_data', options.plugin_data);
        if (options?.branch_data)
            params.append('branch_data', 'true');
        if (params.toString()) {
            endpoint += `?${params.toString()}`;
        }
        return this.request(endpoint);
    }
    /**
     * Resolve a branch key from a branch ID
     * If branchId is provided, fetches branch data and returns the branch's unique key
     * Otherwise returns the main file key unchanged
     * @param fileKey The main file key from the URL
     * @param branchId Optional branch ID from URL query param (branch-id)
     * @returns The effective file key to use for API calls (branch key if on branch, otherwise fileKey)
     */
    async getBranchKey(fileKey, branchId) {
        if (!branchId) {
            return fileKey;
        }
        try {
            logger.info({ fileKey, branchId }, 'Resolving branch key');
            const fileData = await this.getFile(fileKey, { branch_data: true });
            const branches = fileData.branches || [];
            // Try to find branch by key (branchId might already be the key)
            // or by matching other identifiers
            const branch = branches.find((b) => b.key === branchId || b.name === branchId);
            if (branch?.key) {
                logger.info({ fileKey, branchId, branchKey: branch.key, branchName: branch.name }, 'Resolved branch key');
                return branch.key;
            }
            // If branchId looks like a file key (alphanumeric), it might already be the branch key
            // In this case, return it directly as it may be usable
            if (/^[a-zA-Z0-9]+$/.test(branchId)) {
                logger.info({ fileKey, branchId }, 'Branch ID appears to be a key, using directly');
                return branchId;
            }
            logger.warn({ fileKey, branchId, availableBranches: branches.map((b) => ({ key: b.key, name: b.name })) }, 'Branch not found in file, using main file key');
            return fileKey;
        }
        catch (error) {
            logger.error({ error, fileKey, branchId }, 'Failed to resolve branch key, using main file key');
            return fileKey;
        }
    }
    /**
     * GET /v1/files/:file_key/variables/local
     * Get local variables (design tokens) from a file
     */
    async getLocalVariables(fileKey) {
        const response = await this.request(`/files/${fileKey}/variables/local`);
        // Figma API returns {status, error, meta: {variableCollections, variables}}
        // Extract meta to match expected format
        return response.meta || response;
    }
    /**
     * GET /v1/files/:file_key/variables/published
     * Get published variables from a file
     */
    async getPublishedVariables(fileKey) {
        const response = await this.request(`/files/${fileKey}/variables/published`);
        // Figma API returns {status, error, meta: {variableCollections, variables}}
        // Extract meta to match expected format
        return response.meta || response;
    }
    /**
     * GET /v1/files/:file_key/nodes
     * Get specific nodes by ID
     */
    async getNodes(fileKey, nodeIds, options) {
        let endpoint = `/files/${fileKey}/nodes`;
        const params = new URLSearchParams();
        params.append('ids', nodeIds.join(','));
        if (options?.version)
            params.append('version', options.version);
        if (options?.depth !== undefined)
            params.append('depth', options.depth.toString());
        if (options?.geometry)
            params.append('geometry', options.geometry);
        if (options?.plugin_data)
            params.append('plugin_data', options.plugin_data);
        endpoint += `?${params.toString()}`;
        return this.request(endpoint);
    }
    /**
     * GET /v1/files/:file_key/styles
     * Get styles from a file
     */
    async getStyles(fileKey) {
        return this.request(`/files/${fileKey}/styles`);
    }
    /**
     * GET /v1/files/:file_key/components
     * Get components from a file
     */
    async getComponents(fileKey) {
        return this.request(`/files/${fileKey}/components`);
    }
    /**
     * GET /v1/files/:file_key/component_sets
     * Get component sets (variants) from a file
     */
    async getComponentSets(fileKey) {
        return this.request(`/files/${fileKey}/component_sets`);
    }
    /**
     * GET /v1/components/:key
     * Get metadata for a single published component by its key.
     * Returns { status, error, meta: PublishedComponent } where meta includes
     * file_key, node_id, name, description, containing_frame, user, etc.
     * Use this to resolve a componentKey (from search results) to its source file.
     */
    async getComponentByKey(key) {
        return this.request(`/components/${key}`);
    }
    /**
     * GET /v1/component_sets/:key
     * Get metadata for a single published component set (variant container) by its key.
     * Returns { status, error, meta: PublishedComponentSet } with the same fields
     * as getComponentByKey. The node_id points to the parent COMPONENT_SET node.
     */
    async getComponentSetByKey(key) {
        return this.request(`/component_sets/${key}`);
    }
    /**
     * GET /v1/images/:file_key
     * Renders images for specified nodes
     * @param fileKey - The file key
     * @param nodeIds - Node IDs to render (single string or array)
     * @param options - Rendering options
     * @returns Map of node IDs to image URLs (URLs expire after 30 days)
     */
    async getImages(fileKey, nodeIds, options) {
        const params = new URLSearchParams();
        // Handle single or multiple node IDs
        const ids = Array.isArray(nodeIds) ? nodeIds.join(',') : nodeIds;
        params.append('ids', ids);
        // Add optional parameters
        if (options?.scale !== undefined)
            params.append('scale', options.scale.toString());
        if (options?.format)
            params.append('format', options.format);
        if (options?.svg_outline_text !== undefined)
            params.append('svg_outline_text', options.svg_outline_text.toString());
        if (options?.svg_include_id !== undefined)
            params.append('svg_include_id', options.svg_include_id.toString());
        if (options?.svg_include_node_id !== undefined)
            params.append('svg_include_node_id', options.svg_include_node_id.toString());
        if (options?.svg_simplify_stroke !== undefined)
            params.append('svg_simplify_stroke', options.svg_simplify_stroke.toString());
        if (options?.contents_only !== undefined)
            params.append('contents_only', options.contents_only.toString());
        const endpoint = `/images/${fileKey}?${params.toString()}`;
        logger.info({ fileKey, ids, options }, 'Rendering images');
        return this.request(endpoint);
    }
    /**
     * GET /v1/files/:file_key/comments
     * Get comments on a file
     */
    async getComments(fileKey, options) {
        const params = new URLSearchParams();
        if (options?.as_md)
            params.set('as_md', 'true');
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/files/${fileKey}/comments${query}`);
    }
    /**
     * POST /v1/files/:file_key/comments
     * Post a comment on a file
     */
    async postComment(fileKey, message, clientMeta, commentId) {
        return this.request(`/files/${fileKey}/comments`, {
            method: 'POST',
            body: JSON.stringify({
                message,
                ...(clientMeta && { client_meta: clientMeta }),
                ...(commentId && { comment_id: commentId }),
            }),
        });
    }
    /**
     * DELETE /v1/files/:file_key/comments/:comment_id
     * Delete a comment on a file
     */
    async deleteComment(fileKey, commentId) {
        return this.request(`/files/${fileKey}/comments/${commentId}`, {
            method: 'DELETE',
        });
    }
    /**
     * GET /v1/files/:file_key/versions
     * List a file's version history. Cursor-style pagination via before/after
     * (cursors are version IDs). Response includes pagination.prev_page and
     * pagination.next_page as full URLs — Figma recommends following those
     * directly rather than reconstructing cursors. Requires the
     * `file_versions:read` OAuth scope (or PAT "Versions" Read permission).
     */
    async getFileVersions(fileKey, options) {
        const params = new URLSearchParams();
        if (options?.page_size !== undefined)
            params.set('page_size', String(options.page_size));
        if (options?.before)
            params.set('before', options.before);
        if (options?.after)
            params.set('after', options.after);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/files/${fileKey}/versions${query}`);
    }
    /**
     * Helper: Get all design tokens (variables) with formatted output
     * Both local and published can fail gracefully (e.g., 403 without Enterprise plan)
     */
    async getAllVariables(fileKey) {
        // Wrap both in catch handlers to prevent unhandled promise rejections
        // which can crash the server when REST API returns 403
        const [localResult, publishedResult] = await Promise.all([
            this.getLocalVariables(fileKey).catch((err) => {
                const errorMsg = err instanceof Error ? err.message : String(err);
                return { error: errorMsg, variables: {}, variableCollections: {} };
            }),
            this.getPublishedVariables(fileKey).catch((err) => {
                const errorMsg = err instanceof Error ? err.message : String(err);
                return { error: errorMsg, variables: {} };
            }),
        ]);
        return {
            local: 'error' in localResult ? { meta: { variables: {}, variableCollections: {} } } : localResult,
            published: 'error' in publishedResult ? { variables: {} } : publishedResult,
            ...(('error' in localResult) && { localError: localResult.error }),
            ...(('error' in publishedResult) && { publishedError: publishedResult.error }),
        };
    }
    /**
     * Helper: Get component metadata with properties
     */
    async getComponentData(fileKey, nodeId, depth = 4) {
        const response = await this.getNodes(fileKey, [nodeId], { depth });
        return response.nodes?.[nodeId];
    }
    /**
     * Helper: Search for components by name
     */
    async searchComponents(fileKey, searchTerm) {
        const { meta } = await this.getComponents(fileKey);
        const components = meta?.components || [];
        return components.filter((comp) => comp.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
}
/**
 * Helper function to format variables for display
 */
export function formatVariables(variablesData) {
    const collections = Object.entries(variablesData.variableCollections || {}).map(([id, collection]) => ({
        id,
        name: collection.name,
        key: collection.key,
        modes: collection.modes,
        variableIds: collection.variableIds,
    }));
    const variables = Object.entries(variablesData.variables || {}).map(([id, variable]) => ({
        id,
        name: variable.name,
        key: variable.key,
        resolvedType: variable.resolvedType,
        valuesByMode: variable.valuesByMode,
        variableCollectionId: variable.variableCollectionId,
        scopes: variable.scopes,
        description: variable.description,
    }));
    const variablesByType = variables.reduce((acc, v) => {
        acc[v.resolvedType] = (acc[v.resolvedType] || 0) + 1;
        return acc;
    }, {});
    return {
        collections,
        variables,
        summary: {
            totalCollections: collections.length,
            totalVariables: variables.length,
            variablesByType,
        },
    };
}
/**
 * Helper function to format component data for display
 */
export function formatComponentData(componentNode) {
    return {
        id: componentNode.id,
        name: componentNode.name,
        type: componentNode.type,
        description: componentNode.description,
        descriptionMarkdown: componentNode.descriptionMarkdown,
        properties: componentNode.componentPropertyDefinitions,
        children: componentNode.children?.map((child) => ({
            id: child.id,
            name: child.name,
            type: child.type,
        })),
        bounds: componentNode.absoluteBoundingBox,
        fills: componentNode.fills,
        strokes: componentNode.strokes,
        effects: componentNode.effects,
    };
}
//# sourceMappingURL=figma-api.js.map