/**
 * WebSocket Bridge Server (Multi-Client)
 *
 * Creates a WebSocket server that multiple Desktop Bridge plugin instances connect to.
 * Each instance represents a different Figma file and is identified by its fileKey
 * (sent via FILE_INFO on connection). Per-file state (selection, document changes,
 * console logs) is maintained independently.
 *
 * Active file tracking: The "active" file is automatically switched when the user
 * interacts with a file (selection/page changes) or can be set explicitly via
 * setActiveFile(). All backward-compatible getters return data from the active file.
 *
 * Data flow: MCP Server ←WebSocket→ ui.html ←postMessage→ code.js ←figma.*→ Figma
 */
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { ConsoleLogEntry } from './types/index.js';
export interface WebSocketServerOptions {
    port: number;
    host?: string;
}
export interface ConnectedFileInfo {
    fileName: string;
    fileKey: string | null;
    currentPage?: string;
    currentPageId?: string;
    editorType?: 'figma' | 'figjam' | 'dev';
    connectedAt: number;
}
export interface SelectionInfo {
    nodes: Array<{
        id: string;
        name: string;
        type: string;
        width?: number;
        height?: number;
    }>;
    count: number;
    page: string;
    timestamp: number;
}
export interface DocumentChangeEntry {
    hasStyleChanges: boolean;
    hasNodeChanges: boolean;
    changedNodeIds: string[];
    changeCount: number;
    timestamp: number;
}
/**
 * v1.25.0: A single metadata-only change captured by the plugin and forwarded
 * over the WebSocket. Tracks the two fields Figma REST never exposes in version
 * snapshots — `description` and `annotations` — so `figma_diff_versions` can
 * surface them by correlating buffer entries to the diff time window.
 *
 * The plugin captures these on `figma.on('documentchange')` when a PROPERTY_CHANGE
 * touches one of those fields. Only the NEW value is captured (Figma's event
 * doesn't include before/after). The diff engine treats the from-version's
 * value as "whatever it was at the start of the window" — buffer entries
 * within the window are interpreted as "during this version range, the field
 * was edited; final value at end of window is shown."
 */
export interface MetadataChangeEntry {
    node_id: string;
    node_name: string | null;
    node_type: string | null;
    field: 'description' | 'annotations';
    new_value: any;
    timestamp: number;
}
/**
 * Per-file client connection state.
 * Each Figma file with the Desktop Bridge plugin open gets its own ClientConnection.
 */
export interface ClientConnection {
    ws: WebSocket;
    fileInfo: ConnectedFileInfo;
    selection: SelectionInfo | null;
    documentChanges: DocumentChangeEntry[];
    /** v1.25.0: per-file ring buffer of description/annotation change events */
    metadataChanges: MetadataChangeEntry[];
    consoleLogs: ConsoleLogEntry[];
    lastActivity: number;
    lastPongAt: number;
    gracePeriodTimer: ReturnType<typeof setTimeout> | null;
}
export declare class FigmaWebSocketServer extends EventEmitter {
    private wss;
    private httpServer;
    /** Named clients indexed by fileKey — each represents a connected Figma file */
    private clients;
    /** Clients awaiting FILE_INFO identification, mapped to their pending timeout */
    private _pendingClients;
    /** The fileKey of the currently active (targeted) file */
    private _activeFileKey;
    private pendingRequests;
    private requestIdCounter;
    private options;
    private _isStarted;
    private _startedAt;
    private consoleBufferSize;
    private documentChangeBufferSize;
    /** Heartbeat interval for detecting dead connections via ping/pong */
    private _heartbeatInterval;
    constructor(options: WebSocketServerOptions);
    /**
     * Handle HTTP requests on the same port as WebSocket.
     * Serves a JSON `/health` (also at `/`) endpoint with version and connected-file
     * info. No plugin-UI route exists — the plugin loads its own `ui.html` from disk
     * via the Figma plugin runtime; the legacy `/plugin/ui` bootloader endpoint was
     * removed in the Phase 3 cleanup.
     */
    private handleHttpRequest;
    /**
     * Start the HTTP + WebSocket server.
     * HTTP serves the plugin UI content; WebSocket handles plugin communication.
     */
    start(): Promise<void>;
    /**
     * Find a named client connection by its WebSocket reference
     */
    private findClientByWs;
    /**
     * Handle incoming message from a plugin UI WebSocket connection
     */
    private handleMessage;
    /**
     * Handle FILE_INFO message — promotes pending clients to named clients.
     * This is the critical multi-client identification step: each plugin reports
     * its fileKey on connect, allowing the server to track multiple files.
     */
    /** HR TECH: collect local Claude Code account + usage limits for the plugin widget. */
    private collectHrtechHostStatus;
    private handleFileInfo;
    /**
     * Handle a client WebSocket disconnecting.
     * Starts a grace period before removing the client to allow reconnection.
     */
    private handleClientDisconnect;
    /**
     * Send a command to a plugin UI and wait for the response.
     * By default targets the active file. Pass targetFileKey to target a specific file.
     */
    sendCommand(method: string, params?: Record<string, any>, timeoutMs?: number, targetFileKey?: string): Promise<any>;
    /**
     * Start the heartbeat interval that pings all connected clients every 30s.
     * Detects silently dropped connections (e.g., macOS sleep, network change)
     * that the OS TCP keepalive would take 30-120s to catch.
     * Browser WebSocket clients auto-respond to pings per RFC 6455.
     */
    private startHeartbeat;
    /**
     * Check if any named client is connected (transport availability check).
     * Checks both socket readyState and heartbeat pong freshness to avoid
     * reporting phantom-connected state on silently dropped connections.
     */
    isClientConnected(): boolean;
    /**
     * Whether the server has been started
     */
    isStarted(): boolean;
    /**
     * Get the bound address info (port, host, family).
     * Only available after the server has started listening.
     * Returns the actual port — critical when using port 0 for OS-assigned ports.
     */
    address(): import('net').AddressInfo | null;
    /**
     * Get info about the currently active Figma file.
     * Returns null if no file is active or connected.
     */
    getConnectedFileInfo(): ConnectedFileInfo | null;
    /**
     * Get the current user selection in the active Figma file
     */
    getCurrentSelection(): SelectionInfo | null;
    /**
     * Get buffered document change events from the active file
     */
    getDocumentChanges(options?: {
        count?: number;
        since?: number;
    }): DocumentChangeEntry[];
    /**
     * Clear document change buffer for the active file
     */
    clearDocumentChanges(): number;
    /**
     * v1.25.0: Get buffered description/annotation change events for a file.
     *
     * Used by `figma_diff_versions` to surface changes that Figma REST doesn't
     * expose. The diff engine passes a time window (from-version → to-version
     * `last_modified` timestamps converted to Unix ms) and optional scoping by
     * node IDs.
     *
     * Defaults to the active file if `fileKey` is omitted.
     */
    getMetadataChanges(options?: {
        fileKey?: string;
        since?: number;
        until?: number;
        nodeIds?: string[];
    }): MetadataChangeEntry[];
    /**
     * v1.25.0: Clear metadata-change buffer for the active file.
     */
    clearMetadataChanges(): number;
    /**
     * Get console logs from the active file with optional filtering
     */
    getConsoleLogs(options?: {
        count?: number;
        level?: ConsoleLogEntry['level'] | 'all';
        since?: number;
    }): ConsoleLogEntry[];
    /**
     * Clear console log buffer for the active file
     */
    clearConsoleLogs(): number;
    /**
     * Get console monitoring status for the active file
     */
    getConsoleStatus(): {
        isMonitoring: boolean;
        anyClientConnected: boolean;
        logCount: number;
        bufferSize: number;
        workerCount: number;
        oldestTimestamp: number;
        newestTimestamp: number;
    };
    /**
     * Get info about all connected Figma files.
     * Returns an array of ConnectedFileInfo for each file with an active WebSocket.
     */
    getConnectedFiles(): (ConnectedFileInfo & {
        isActive: boolean;
    })[];
    /**
     * Get the last pong timestamp for the active client.
     * Returns null if no active client or no pong received yet.
     */
    getActiveClientLastPongAt(): number | null;
    /**
     * Set the active file by fileKey. Returns true if the file is connected.
     */
    setActiveFile(fileKey: string): boolean;
    /**
     * Get the currently active file's key
     */
    getActiveFileKey(): string | null;
    /**
     * Get the editor type of the currently active file.
     * Returns 'figma' if no file is connected or editorType wasn't reported.
     */
    getEditorType(): 'figma' | 'figjam' | 'dev';
    /**
     * Reject pending requests that were sent to a specific file
     */
    private rejectPendingRequestsForFile;
    /**
     * Reject all pending requests (used during shutdown)
     */
    private rejectPendingRequests;
    /**
     * Stop the server and clean up all connections
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=websocket-server.d.ts.map