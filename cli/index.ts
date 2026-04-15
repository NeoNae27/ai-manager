#!/usr/bin/env node

import { createApplicationProviderManager } from './bootstrap.js';
import { CliApplication } from './app.js';

const providerManager = createApplicationProviderManager();
const app = new CliApplication(providerManager);

try {
  await app.run();
} catch (error) {
  const message = error instanceof Error ? error.message : 'An unknown error occurred.';
  console.error(`CLI failed: ${message}`);
  process.exit(1);
}
