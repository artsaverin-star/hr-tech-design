/**
 * WebSocket Figma Connector
 *
 * Implements IFigmaConnector using the WebSocket Desktop Bridge transport.
 * Each method sends a command to the plugin UI via WebSocket and waits
 * for the response — same window.* functions, different transport.
 *
 * Data flow: MCP Server ←WebSocket→ ui.html ←postMessage→ code.js ←figma.*→ Figma
 */
import { createChildLogger } from './logger.js';
const logger = createChildLogger({ component: 'websocket-connector' });
export class WebSocketConnector {
    constructor(wsServer) {
        this.wsServer = wsServer;
    }
    async initialize() {
        if (!this.wsServer.isClientConnected()) {
            throw new Error('No WebSocket client connected. Make sure the Desktop Bridge plugin is open in Figma.');
        }
        logger.info('WebSocket connector initialized');
    }
    getTransportType() {
        return 'websocket';
    }
    // ============================================================================
    // Core execution
    // ============================================================================
    async executeInPluginContext(code) {
        return this.wsServer.sendCommand('EXECUTE_CODE', { code, timeout: 115000 }, 120000);
    }
    async getVariablesFromPluginUI(fileKey) {
        // Request the cached variables data that the plugin UI holds in window.__figmaVariablesData
        return this.wsServer.sendCommand('GET_VARIABLES_DATA', {}, 10000, fileKey);
    }
    async getVariables(fileKey) {
        // Execute the same variables-fetching code in the plugin worker context.
        //
        // IMPORTANT: Do NOT wrap this in an inner `(async () => { ... })()` IIFE.
        // figma-desktop-bridge/code.js already wraps every EXECUTE_CODE payload in
        // `(async function() { <code> })()`. An inner IIFE turns `return X` into a
        // statement-expression that builds (but doesn't return) a Promise — the
        // outer async returns undefined, and the result is silently dropped. See
        // issue #68. The bare try/catch with top-level `return` is the contract
        // code.js expects.
        const code = `
      try {
        if (typeof figma === 'undefined') {
          throw new Error('Figma API not available in this context');
        }
        const variables = await figma.variables.getLocalVariablesAsync();
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        return {
          success: true,
          timestamp: Date.now(),
          fileMetadata: { fileName: figma.root.name, fileKey: figma.fileKey || null },
          variables: variables.map(function(v) { return { id: v.id, name: v.name, key: v.key, resolvedType: v.resolvedType, valuesByMode: v.valuesByMode, variableCollectionId: v.variableCollectionId, scopes: v.scopes, description: v.description, hiddenFromPublishing: v.hiddenFromPublishing }; }),
          variableCollections: collections.map(function(c) { return { id: c.id, name: c.name, key: c.key, modes: c.modes, defaultModeId: c.defaultModeId, variableIds: c.variableIds }; })
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    `;
        return this.wsServer.sendCommand('EXECUTE_CODE', { code, timeout: 30000 }, 32000, fileKey);
    }
    async executeCodeViaUI(code, timeoutMs = 5000) {
        // HR TECH flight recorder
        const fs = await import('node:fs');
        const preview = code.replace(/\s+/g, ' ').slice(0, 350);
        const t0 = Date.now();
        try {
            fs.appendFileSync('/tmp/hrtech-exec.log', new Date().toISOString() + ' START ' + preview + '\n');
        }
        catch { }
        const done = (tag) => { try {
            fs.appendFileSync('/tmp/hrtech-exec.log', new Date().toISOString() + ' ' + tag + ' ' + (Date.now() - t0) + 'ms ' + preview.slice(0, 80) + '\n');
        }
        catch { } };
        try {
            const r = await this.wsServer.sendCommand('EXECUTE_CODE', { code, timeout: timeoutMs }, timeoutMs + 2000);
            done('DONE');
            return r;
        }
        catch (e) {
            done('FAIL');
            throw e;
        }
    }
    // ============================================================================
    // Variable operations
    // ============================================================================
    async updateVariable(variableId, modeId, value) {
        return this.wsServer.sendCommand('UPDATE_VARIABLE', { variableId, modeId, value });
    }
    async createVariable(name, collectionId, resolvedType, options) {
        const params = { name, collectionId, resolvedType };
        if (options) {
            if (options.valuesByMode)
                params.valuesByMode = options.valuesByMode;
            if (options.description)
                params.description = options.description;
            if (options.scopes)
                params.scopes = options.scopes;
        }
        return this.wsServer.sendCommand('CREATE_VARIABLE', params);
    }
    async deleteVariable(variableId) {
        return this.wsServer.sendCommand('DELETE_VARIABLE', { variableId });
    }
    async refreshVariables() {
        return this.wsServer.sendCommand('REFRESH_VARIABLES', {}, 300000);
    }
    async renameVariable(variableId, newName) {
        const result = await this.wsServer.sendCommand('RENAME_VARIABLE', { variableId, newName });
        // oldName may be embedded in variable data if ui.html handleResult doesn't pass it through
        if (!result.oldName && result.variable?.oldName)
            result.oldName = result.variable.oldName;
        return result;
    }
    async setVariableDescription(variableId, description) {
        return this.wsServer.sendCommand('SET_VARIABLE_DESCRIPTION', { variableId, description });
    }
    // ============================================================================
    // Mode operations
    // ============================================================================
    async addMode(collectionId, modeName) {
        return this.wsServer.sendCommand('ADD_MODE', { collectionId, modeName });
    }
    async renameMode(collectionId, modeId, newName) {
        const result = await this.wsServer.sendCommand('RENAME_MODE', { collectionId, modeId, newName });
        // oldName may be embedded in collection data if ui.html handleResult doesn't pass it through
        if (!result.oldName && result.collection?.oldName)
            result.oldName = result.collection.oldName;
        return result;
    }
    // ============================================================================
    // Collection operations
    // ============================================================================
    async createVariableCollection(name, options) {
        const params = { name };
        if (options) {
            if (options.initialModeName)
                params.initialModeName = options.initialModeName;
            if (options.additionalModes)
                params.additionalModes = options.additionalModes;
        }
        return this.wsServer.sendCommand('CREATE_VARIABLE_COLLECTION', params);
    }
    async deleteVariableCollection(collectionId) {
        return this.wsServer.sendCommand('DELETE_VARIABLE_COLLECTION', { collectionId });
    }
    // ============================================================================
    // Component operations
    // ============================================================================
    async getComponentFromPluginUI(nodeId) {
        return this.wsServer.sendCommand('GET_COMPONENT', { nodeId }, 10000);
    }
    async getLocalComponents() {
        return this.wsServer.sendCommand('GET_LOCAL_COMPONENTS', {}, 300000);
    }
    async setNodeDescription(nodeId, description, descriptionMarkdown) {
        return this.wsServer.sendCommand('SET_NODE_DESCRIPTION', { nodeId, description, descriptionMarkdown });
    }
    // ============================================================================
    // Annotation operations
    // ============================================================================
    async getAnnotations(nodeId, includeChildren, depth) {
        return this.wsServer.sendCommand('GET_ANNOTATIONS', { nodeId, includeChildren, depth }, 10000);
    }
    async setAnnotations(nodeId, annotations, mode) {
        return this.wsServer.sendCommand('SET_ANNOTATIONS', { nodeId, annotations, mode: mode || 'replace' });
    }
    async getAnnotationCategories() {
        return this.wsServer.sendCommand('GET_ANNOTATION_CATEGORIES', {}, 5000);
    }
    async deepGetComponent(nodeId, depth) {
        return this.wsServer.sendCommand('DEEP_GET_COMPONENT', { nodeId, depth: depth || 10 }, 30000);
    }
    async analyzeComponentSet(nodeId) {
        return this.wsServer.sendCommand('ANALYZE_COMPONENT_SET', { nodeId }, 30000);
    }
    async addComponentProperty(nodeId, propertyName, type, defaultValue, options) {
        const params = { nodeId, propertyName, propertyType: type, defaultValue };
        if (options?.preferredValues)
            params.preferredValues = options.preferredValues;
        return this.wsServer.sendCommand('ADD_COMPONENT_PROPERTY', params);
    }
    async editComponentProperty(nodeId, propertyName, newValue) {
        return this.wsServer.sendCommand('EDIT_COMPONENT_PROPERTY', { nodeId, propertyName, newValue });
    }
    async deleteComponentProperty(nodeId, propertyName) {
        return this.wsServer.sendCommand('DELETE_COMPONENT_PROPERTY', { nodeId, propertyName });
    }
    async instantiateComponent(componentKey, options) {
        const params = { componentKey };
        if (options) {
            if (options.nodeId)
                params.nodeId = options.nodeId;
            if (options.position)
                params.position = options.position;
            if (options.size)
                params.size = options.size;
            if (options.overrides)
                params.overrides = options.overrides;
            if (options.variant)
                params.variant = options.variant;
            if (options.parentId)
                params.parentId = options.parentId;
        }
        return this.wsServer.sendCommand('INSTANTIATE_COMPONENT', params);
    }
    // ============================================================================
    // Node manipulation
    // ============================================================================
    async resizeNode(nodeId, width, height, withConstraints = true) {
        return this.wsServer.sendCommand('RESIZE_NODE', { nodeId, width, height, withConstraints });
    }
    async moveNode(nodeId, x, y) {
        return this.wsServer.sendCommand('MOVE_NODE', { nodeId, x, y });
    }
    async setNodeFills(nodeId, fills) {
        return this.wsServer.sendCommand('SET_NODE_FILLS', { nodeId, fills });
    }
    async setNodeStrokes(nodeId, strokes, strokeWeight) {
        const params = { nodeId, strokes };
        if (strokeWeight !== undefined)
            params.strokeWeight = strokeWeight;
        return this.wsServer.sendCommand('SET_NODE_STROKES', params);
    }
    async setNodeOpacity(nodeId, opacity) {
        return this.wsServer.sendCommand('SET_NODE_OPACITY', { nodeId, opacity });
    }
    async setNodeCornerRadius(nodeId, radius) {
        return this.wsServer.sendCommand('SET_NODE_CORNER_RADIUS', { nodeId, radius });
    }
    async cloneNode(nodeId) {
        return this.wsServer.sendCommand('CLONE_NODE', { nodeId });
    }
    async deleteNode(nodeId) {
        return this.wsServer.sendCommand('DELETE_NODE', { nodeId });
    }
    async renameNode(nodeId, newName) {
        return this.wsServer.sendCommand('RENAME_NODE', { nodeId, newName });
    }
    async setTextContent(nodeId, characters, options) {
        const params = { nodeId, text: characters };
        if (options) {
            if (options.fontSize)
                params.fontSize = options.fontSize;
            if (options.fontWeight)
                params.fontWeight = options.fontWeight;
            if (options.fontFamily)
                params.fontFamily = options.fontFamily;
            if (options.fontStyle)
                params.fontStyle = options.fontStyle;
        }
        return this.wsServer.sendCommand('SET_TEXT_CONTENT', params);
    }
    async createChildNode(parentId, nodeType, properties) {
        return this.wsServer.sendCommand('CREATE_CHILD_NODE', { parentId, nodeType, properties: properties || {} });
    }
    // ============================================================================
    // Screenshot & instance properties
    // ============================================================================
    async captureScreenshot(nodeId, options) {
        const params = { nodeId };
        if (options?.format)
            params.format = options.format;
        if (options?.scale)
            params.scale = options.scale;
        return this.wsServer.sendCommand('CAPTURE_SCREENSHOT', params, 30000);
    }
    async setInstanceProperties(nodeId, properties) {
        return this.wsServer.sendCommand('SET_INSTANCE_PROPERTIES', { nodeId, properties });
    }
    // ============================================================================
    // Image fill
    // ============================================================================
    async setImageFill(nodeIds, imageData, scaleMode = 'FILL') {
        return this.wsServer.sendCommand('SET_IMAGE_FILL', { nodeIds, imageData, scaleMode }, 60000);
    }
    // ============================================================================
    // Design lint
    // ============================================================================
    async lintDesign(nodeId, rules, maxDepth, maxFindings) {
        const params = {};
        if (nodeId)
            params.nodeId = nodeId;
        if (rules)
            params.rules = rules;
        if (maxDepth !== undefined)
            params.maxDepth = maxDepth;
        if (maxFindings !== undefined)
            params.maxFindings = maxFindings;
        return this.wsServer.sendCommand('LINT_DESIGN', params, 120000);
    }
    // ============================================================================
    // Component accessibility audit
    // ============================================================================
    async auditComponentAccessibility(nodeId, targetSize) {
        const params = {};
        if (nodeId)
            params.nodeId = nodeId;
        if (targetSize !== undefined)
            params.targetSize = targetSize;
        return this.wsServer.sendCommand('AUDIT_COMPONENT_ACCESSIBILITY', params, 120000);
    }
    // ============================================================================
    // FigJam operations
    // ============================================================================
    async createSticky(params) {
        return this.wsServer.sendCommand('CREATE_STICKY', params);
    }
    async createStickies(params) {
        return this.wsServer.sendCommand('CREATE_STICKIES', params, 30000);
    }
    async createConnector(params) {
        return this.wsServer.sendCommand('CREATE_CONNECTOR', params);
    }
    async createShapeWithText(params) {
        return this.wsServer.sendCommand('CREATE_SHAPE_WITH_TEXT', params);
    }
    async createSection(params) {
        return this.wsServer.sendCommand('CREATE_SECTION', params);
    }
    async createTable(params) {
        return this.wsServer.sendCommand('CREATE_TABLE', params, 30000);
    }
    async createCodeBlock(params) {
        return this.wsServer.sendCommand('CREATE_CODE_BLOCK', params);
    }
    async getBoardContents(params) {
        return this.wsServer.sendCommand('GET_BOARD_CONTENTS', params, 30000);
    }
    async getConnections() {
        return this.wsServer.sendCommand('GET_CONNECTIONS', {}, 15000);
    }
    // ============================================================================
    // Slides operations
    // ============================================================================
    async listSlides() {
        return this.wsServer.sendCommand('LIST_SLIDES', {}, 10000);
    }
    async getSlideContent(params) {
        return this.wsServer.sendCommand('GET_SLIDE_CONTENT', params, 10000);
    }
    async createSlide(params) {
        return this.wsServer.sendCommand('CREATE_SLIDE', params, 10000);
    }
    async deleteSlide(params) {
        return this.wsServer.sendCommand('DELETE_SLIDE', params, 5000);
    }
    async duplicateSlide(params) {
        return this.wsServer.sendCommand('DUPLICATE_SLIDE', params, 5000);
    }
    async getSlideGrid() {
        return this.wsServer.sendCommand('GET_SLIDE_GRID', {}, 10000);
    }
    async reorderSlides(params) {
        return this.wsServer.sendCommand('REORDER_SLIDES', params, 15000);
    }
    async setSlideTransition(params) {
        return this.wsServer.sendCommand('SET_SLIDE_TRANSITION', params, 5000);
    }
    async getSlideTransition(params) {
        return this.wsServer.sendCommand('GET_SLIDE_TRANSITION', params, 5000);
    }
    async setSlidesViewMode(params) {
        return this.wsServer.sendCommand('SET_SLIDES_VIEW_MODE', params, 5000);
    }
    async getFocusedSlide() {
        return this.wsServer.sendCommand('GET_FOCUSED_SLIDE', {}, 5000);
    }
    async focusSlide(params) {
        return this.wsServer.sendCommand('FOCUS_SLIDE', params, 5000);
    }
    async skipSlide(params) {
        return this.wsServer.sendCommand('SKIP_SLIDE', params, 5000);
    }
    async addTextToSlide(params) {
        return this.wsServer.sendCommand('ADD_TEXT_TO_SLIDE', params, 10000);
    }
    async addShapeToSlide(params) {
        return this.wsServer.sendCommand('ADD_SHAPE_TO_SLIDE', params, 5000);
    }
    async setSlideBackground(params) {
        return this.wsServer.sendCommand('SET_SLIDE_BACKGROUND', params, 5000);
    }
    async getTextStyles() {
        return this.wsServer.sendCommand('GET_TEXT_STYLES', {}, 5000);
    }
    // ============================================================================
    // Cache management (no-op for WebSocket — no frame cache)
    // ============================================================================
    clearFrameCache() {
        // No frame cache in WebSocket mode
    }
}
//# sourceMappingURL=websocket-connector.js.map