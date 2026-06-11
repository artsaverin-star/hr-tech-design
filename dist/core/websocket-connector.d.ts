/**
 * WebSocket Figma Connector
 *
 * Implements IFigmaConnector using the WebSocket Desktop Bridge transport.
 * Each method sends a command to the plugin UI via WebSocket and waits
 * for the response — same window.* functions, different transport.
 *
 * Data flow: MCP Server ←WebSocket→ ui.html ←postMessage→ code.js ←figma.*→ Figma
 */
import type { IFigmaConnector } from './figma-connector.js';
import type { FigmaWebSocketServer } from './websocket-server.js';
export declare class WebSocketConnector implements IFigmaConnector {
    private wsServer;
    constructor(wsServer: FigmaWebSocketServer);
    initialize(): Promise<void>;
    getTransportType(): 'websocket';
    executeInPluginContext<T = any>(code: string): Promise<T>;
    getVariablesFromPluginUI(fileKey?: string): Promise<any>;
    getVariables(fileKey?: string): Promise<any>;
    executeCodeViaUI(code: string, timeoutMs?: number): Promise<any>;
    updateVariable(variableId: string, modeId: string, value: any): Promise<any>;
    createVariable(name: string, collectionId: string, resolvedType: string, options?: any): Promise<any>;
    deleteVariable(variableId: string): Promise<any>;
    refreshVariables(): Promise<any>;
    renameVariable(variableId: string, newName: string): Promise<any>;
    setVariableDescription(variableId: string, description: string): Promise<any>;
    addMode(collectionId: string, modeName: string): Promise<any>;
    renameMode(collectionId: string, modeId: string, newName: string): Promise<any>;
    createVariableCollection(name: string, options?: any): Promise<any>;
    deleteVariableCollection(collectionId: string): Promise<any>;
    getComponentFromPluginUI(nodeId: string): Promise<any>;
    getLocalComponents(): Promise<any>;
    setNodeDescription(nodeId: string, description: string, descriptionMarkdown?: string): Promise<any>;
    getAnnotations(nodeId: string, includeChildren?: boolean, depth?: number): Promise<any>;
    setAnnotations(nodeId: string, annotations: any[], mode?: 'replace' | 'append'): Promise<any>;
    getAnnotationCategories(): Promise<any>;
    deepGetComponent(nodeId: string, depth?: number): Promise<any>;
    analyzeComponentSet(nodeId: string): Promise<any>;
    addComponentProperty(nodeId: string, propertyName: string, type: string, defaultValue: any, options?: any): Promise<any>;
    editComponentProperty(nodeId: string, propertyName: string, newValue: any): Promise<any>;
    deleteComponentProperty(nodeId: string, propertyName: string): Promise<any>;
    instantiateComponent(componentKey: string, options?: any): Promise<any>;
    resizeNode(nodeId: string, width: number, height: number, withConstraints?: boolean): Promise<any>;
    moveNode(nodeId: string, x: number, y: number): Promise<any>;
    setNodeFills(nodeId: string, fills: any[]): Promise<any>;
    setNodeStrokes(nodeId: string, strokes: any[], strokeWeight?: number): Promise<any>;
    setNodeOpacity(nodeId: string, opacity: number): Promise<any>;
    setNodeCornerRadius(nodeId: string, radius: number): Promise<any>;
    cloneNode(nodeId: string): Promise<any>;
    deleteNode(nodeId: string): Promise<any>;
    renameNode(nodeId: string, newName: string): Promise<any>;
    setTextContent(nodeId: string, characters: string, options?: any): Promise<any>;
    createChildNode(parentId: string, nodeType: string, properties?: any): Promise<any>;
    captureScreenshot(nodeId: string, options?: any): Promise<any>;
    setInstanceProperties(nodeId: string, properties: any): Promise<any>;
    setImageFill(nodeIds: string[], imageData: string, scaleMode?: string): Promise<any>;
    lintDesign(nodeId?: string, rules?: string[], maxDepth?: number, maxFindings?: number): Promise<any>;
    auditComponentAccessibility(nodeId?: string, targetSize?: number): Promise<any>;
    createSticky(params: {
        text: string;
        color?: string;
        x?: number;
        y?: number;
    }): Promise<any>;
    createStickies(params: {
        stickies: Array<{
            text: string;
            color?: string;
            x?: number;
            y?: number;
        }>;
    }): Promise<any>;
    createConnector(params: {
        startNodeId: string;
        endNodeId: string;
        label?: string;
        startMagnet?: string;
        endMagnet?: string;
    }): Promise<any>;
    createShapeWithText(params: {
        text?: string;
        shapeType?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        fillColor?: string;
        strokeColor?: string;
        fontSize?: number;
        strokeDashPattern?: string;
    }): Promise<any>;
    createSection(params: {
        name?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        fillColor?: string;
    }): Promise<any>;
    createTable(params: {
        rows: number;
        columns: number;
        data?: string[][];
        x?: number;
        y?: number;
    }): Promise<any>;
    createCodeBlock(params: {
        code: string;
        language?: string;
        x?: number;
        y?: number;
    }): Promise<any>;
    getBoardContents(params: {
        nodeTypes?: string[];
        maxNodes?: number;
    }): Promise<any>;
    getConnections(): Promise<any>;
    listSlides(): Promise<any>;
    getSlideContent(params: {
        slideId: string;
    }): Promise<any>;
    createSlide(params: {
        row?: number;
        col?: number;
    }): Promise<any>;
    deleteSlide(params: {
        slideId: string;
    }): Promise<any>;
    duplicateSlide(params: {
        slideId: string;
    }): Promise<any>;
    getSlideGrid(): Promise<any>;
    reorderSlides(params: {
        grid: string[][];
    }): Promise<any>;
    setSlideTransition(params: {
        slideId: string;
        style: string;
        duration: number;
        curve: string;
    }): Promise<any>;
    getSlideTransition(params: {
        slideId: string;
    }): Promise<any>;
    setSlidesViewMode(params: {
        mode: string;
    }): Promise<any>;
    getFocusedSlide(): Promise<any>;
    focusSlide(params: {
        slideId: string;
    }): Promise<any>;
    skipSlide(params: {
        slideId: string;
        skip: boolean;
    }): Promise<any>;
    addTextToSlide(params: {
        slideId: string;
        text: string;
        x?: number;
        y?: number;
        fontSize?: number;
        fontFamily?: string;
        fontStyle?: string;
        color?: string;
        textAlign?: string;
        width?: number;
        lineHeight?: number;
        letterSpacing?: number;
        textCase?: string;
    }): Promise<any>;
    addShapeToSlide(params: {
        slideId: string;
        shapeType: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fillColor?: string;
    }): Promise<any>;
    setSlideBackground(params: {
        slideId: string;
        color: string;
    }): Promise<any>;
    getTextStyles(): Promise<any>;
    clearFrameCache(): void;
}
//# sourceMappingURL=websocket-connector.d.ts.map