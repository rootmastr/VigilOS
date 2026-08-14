/**
 * WebSocket module entry point.
 * Re-exports VigilWSServer and configuration for clean imports.
 */

export { VigilWSServer, CONFIG as WS_CONFIG, PRIORITY, CHANNEL_PERMISSIONS } from './server.js';
