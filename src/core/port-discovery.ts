/**
 * Port Discovery Module
 *
 * Handles dynamic WebSocket port assignment with range-based fallback.
 * When the preferred port (default 9223) is taken by another MCP server instance
 * (e.g., Claude Desktop Chat tab vs Code tab), the server automatically tries
 * the next port in a fixed range (9223-9232).
 *
 * Port advertisement files are written to /tmp so the Figma plugin can discover
 * which port to connect to. Each instance writes its own file with PID for
 * stale-file detection.
 *
 * Port metadata cleanup never terminates processes. A missing or late heartbeat
 * can mean a sleeping laptop or a busy event loop, not an abandoned MCP session.
 * Only metadata for confirmed dead processes is removed automatically.
 *
 * Data flow:
 *   Server binds port → writes /tmp/figma-console-mcp-{port}.json
 *   Server heartbeat → refreshes lastSeen every 30s
 *   Plugin scans ports 9223-9232 → connects to all responding servers
 *   External tools read port files for discovery
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createChildLogger } from './logger.js';

const logger = createChildLogger({ component: 'port-discovery' });

/** Default preferred WebSocket port */
export const DEFAULT_WS_PORT = 9223;

/** Number of ports in the fallback range (9223-9232 = 10 ports) */
export const PORT_RANGE_SIZE = 10;

/** Prefix for port advertisement files in /tmp */
const PORT_FILE_PREFIX = 'figma-console-mcp-';

/** Directory for port advertisement files */
const PORT_FILE_DIR = tmpdir();

/** Maximum age before a port file without heartbeat is considered stale (4 hours) */
export const MAX_PORT_FILE_AGE_MS = 4 * 60 * 60 * 1000;

/** Maximum time since last heartbeat before a process is considered stale (5 minutes) */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

/** Interval for the periodic background reaper (ms) */
export const REAP_INTERVAL_MS = 5 * 60 * 1000;

/** Interval between heartbeat refreshes (30 seconds) */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export interface PortFileData {
  port: number;
  pid: number;
  host: string;
  startedAt: string;
  /** Updated by heartbeat every 30s. Missing in port files from pre-v1.12 instances. */
  lastSeen?: string;
}

/**
 * Try to bind a WebSocket server to ports in a range, starting from the preferred port.
 * Returns the first port that binds successfully.
 *
 * @param preferredPort - The port to try first (default 9223)
 * @param host - The host to bind to (default 'localhost')
 * @returns The actual port that was bound
 * @throws If all ports in the range are exhausted
 */
export function getPortRange(preferredPort: number = DEFAULT_WS_PORT): number[] {
  const ports: number[] = [];
  for (let i = 0; i < PORT_RANGE_SIZE; i++) {
    ports.push(preferredPort + i);
  }
  return ports;
}

/**
 * Get the file path for a port advertisement file.
 */
export function getPortFilePath(port: number): string {
  return join(PORT_FILE_DIR, `${PORT_FILE_PREFIX}${port}.json`);
}

/**
 * Write a port advertisement file so clients can discover this server instance.
 * Includes PID for stale-file detection and lastSeen for heartbeat tracking.
 */
export function advertisePort(port: number, host: string = 'localhost'): void {
  const now = new Date().toISOString();
  const data: PortFileData = {
    port,
    pid: process.pid,
    host,
    startedAt: now,
    lastSeen: now,
  };

  const filePath = getPortFilePath(port);
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info({ port, filePath }, 'Port advertised');
  } catch (error) {
    logger.warn({ port, filePath, error }, 'Failed to write port advertisement file');
  }
}

/**
 * Refresh the lastSeen timestamp in a port advertisement file.
 * Called periodically as a heartbeat to prove this server is still active.
 * Non-fatal — heartbeat failures are silently ignored.
 */
export function refreshPortAdvertisement(port: number): void {
  const filePath = getPortFilePath(port);
  try {
    if (!existsSync(filePath)) return;
    const raw = readFileSync(filePath, 'utf-8');
    const data: PortFileData = JSON.parse(raw);
    // Only refresh our own port file
    if (data.pid !== process.pid) return;
    data.lastSeen = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch {
    // Best-effort — heartbeat failures are non-fatal
  }
}

/**
 * Remove the port advertisement file for this instance.
 * Call on clean shutdown.
 */
export function unadvertisePort(port: number): void {
  const filePath = getPortFilePath(port);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.debug({ port, filePath }, 'Port advertisement removed');
    }
  } catch {
    // Best-effort cleanup — file may already be gone
  }
}

/**
 * Check if a PID is still alive.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = existence check, doesn't actually kill
    return true;
  } catch (error) {
    // EPERM and unexpected failures do not prove that the process is gone.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Determine whether a port heartbeat is overdue (diagnostic only).
 *
 * Detection layers:
 *   1. If lastSeen exists (v1.12+): stale if older than HEARTBEAT_STALE_MS (5 min)
 *   2. If lastSeen is missing (pre-v1.12): stale if startedAt older than MAX_PORT_FILE_AGE_MS (4h)
 *
 * An overdue heartbeat never authorizes terminating the owning process.
 */
export function isStaleInstance(data: PortFileData): boolean {
  const now = Date.now();

  // If heartbeat exists, use it — active servers refresh every 30s
  if (data.lastSeen) {
    const lastSeenAge = now - new Date(data.lastSeen).getTime();
    return lastSeenAge > HEARTBEAT_STALE_MS;
  }

  // No heartbeat (pre-v1.12 instance) — fall back to startup age
  const startedAge = now - new Date(data.startedAt).getTime();
  return startedAge > MAX_PORT_FILE_AGE_MS;
}

/**
 * Read and validate a port advertisement file.
 * Returns null if the file doesn't exist, is invalid, or the owning process is dead.
 */
export function readPortFile(port: number): PortFileData | null {
  const filePath = getPortFilePath(port);

  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data: PortFileData = JSON.parse(raw);

    if (!Number.isInteger(data.pid) || data.pid <= 0) return null;

    // Validate the owning process is still alive
    if (!isProcessAlive(data.pid)) {
      logger.debug({ port, pid: data.pid }, 'Stale port file detected (process dead), cleaning up');
      try { unlinkSync(filePath); } catch { /* best-effort */ }
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Discover all active Figma Console MCP server instances by scanning port files.
 * Validates each file's PID to filter out stale entries.
 */
export function discoverActiveInstances(preferredPort: number = DEFAULT_WS_PORT): PortFileData[] {
  const instances: PortFileData[] = [];

  for (const port of getPortRange(preferredPort)) {
    const data = readPortFile(port);
    if (data) {
      instances.push(data);
    }
  }

  return instances;
}

/**
 * Remove invalid metadata and files owned by confirmed dead processes.
 * A live PID is preserved regardless of heartbeat/startup age. In particular,
 * another bridge may run this immediately after wake, before its sibling's
 * heartbeat callback has had a chance to refresh the timestamp.
 */
export function cleanupStalePortFiles(): number {
  let cleaned = 0;

  try {
    const files = readdirSync(PORT_FILE_DIR);
    for (const file of files) {
      if (file.startsWith(PORT_FILE_PREFIX) && file.endsWith('.json')) {
        const filePath = join(PORT_FILE_DIR, file);
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const data: PortFileData = JSON.parse(raw);

          if (!Number.isInteger(data.pid) || data.pid <= 0 || !isProcessAlive(data.pid)) {
            // Dead PID — just clean up the file
            unlinkSync(filePath);
            cleaned++;
            logger.debug({ port: data.port, pid: data.pid }, 'Cleaned up stale port file (dead process)');
          }
        } catch {
          // Corrupt file — remove it
          try { unlinkSync(filePath); cleaned++; } catch { /* ignore */ }
        }
      }
    }
  } catch {
    // Can't read /tmp — unusual but not fatal
  }

  return cleaned;
}

/**
 * Kept for callers of the previous recovery API. A missing advertisement cannot
 * distinguish an abandoned process from an active session whose file was lost.
 * Never scan/terminate live listeners automatically; let startup report the
 * occupied range and the user decide which sessions to close.
 */
export function cleanupOrphanedProcesses(
  _preferredPort: number = DEFAULT_WS_PORT,
  _options: { minAgeMs?: number } = {},
): number {
  return 0;
}

/**
 * Exhausting the range does not authorize terminating another MCP session.
 * Preserve the recovery API while leaving live owners alone. Returning false
 * makes startup report EADDRINUSE instead of replacing an active assistant.
 */
export function evictOldestInstance(_preferredPort: number = DEFAULT_WS_PORT): boolean {
  return false;
}

/**
 * Register process exit handlers to clean up port advertisement file.
 * Should be called once after the port is successfully bound.
 */
export function registerPortCleanup(port: number): void {
  const cleanup = () => unadvertisePort(port);

  process.on('exit', cleanup);

  // Re-register SIGINT/SIGTERM to ensure cleanup runs before the
  // existing handlers in local.ts main() call process.exit()
  const originalSigintListeners = process.listeners('SIGINT');
  const originalSigtermListeners = process.listeners('SIGTERM');

  // Prepend our cleanup — it runs first, then existing handlers take over
  process.prependListener('SIGINT', cleanup);
  process.prependListener('SIGTERM', cleanup);
}

/**
 * Periodically remove metadata for processes that have exited. This performs
 * no listener scan and never terminates another session. The interval is unref'd
 * so it cannot keep this server alive on its own.
 */
export function startPeriodicReaper(_preferredPort: number = DEFAULT_WS_PORT): () => void {
  const tick = () => {
    try {
      cleanupStalePortFiles();
    } catch (error) {
      logger.warn({ error }, 'Periodic reaper tick failed');
    }
  };
  const interval = setInterval(tick, REAP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
  return () => clearInterval(interval);
}
