#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// DEOLS Automation Daemon Runner
// Server-side cron service worker for scheduled WP-Cron, SSL, & tasks
// ─────────────────────────────────────────────────────────────

import { startAutomationDaemon, tickAutomation } from '../backend/services/automation.js';

console.log('⚡ Starting DEOLS Server-Side Automation Service…');
startAutomationDaemon();
console.log('✓ Automation daemon active — running scheduled WP-Cron, SSL auto-renewal, and background tasks.');

// Keep process alive and handle shutdown signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Stopping automation daemon…');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Stopping automation daemon…');
  process.exit(0);
});
