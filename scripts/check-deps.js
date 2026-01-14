#!/usr/bin/env node

/**
 * Check if node_modules exists and warn if not.
 * Uses ANSI escape codes for colored output without external dependencies.
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const nodeModulesPath = join(projectRoot, 'node_modules');

// ANSI color codes for terminal output: 
// \x1b[31m = red (errors), \x1b[33m = yellow (warnings), \x1b[32m = green (success), \x1b[0m = reset
if (!existsSync(nodeModulesPath)) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: node_modules directory not found!');
  console.error('\x1b[33m%s\x1b[0m', '⚠️  Please run "npm install" first to install dependencies.');
  console.error('');
  process.exit(1);
}

console.log('\x1b[32m%s\x1b[0m', '✓ Dependencies check passed');
