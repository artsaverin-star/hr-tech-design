#!/usr/bin/env node
// Stable stdio entry point. The assistant keeps this connection through updates.
import { startSupervisor } from './supervisor.mjs';
startSupervisor();
