#!/usr/bin/env node
// Step 1: fetches $metadata from API_BUSINESS_PARTNER through the SA1_300 destination.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { createClient } from './lib/transport.mjs';

const client = await createClient(config.destination);
console.log(`destination : ${await client.info()}`);

const url = `${config.source.servicePath}/$metadata`;
const params = config.source.sapClient ? { 'sap-client': config.source.sapClient } : {};
console.log(`GET         : ${url}`);

const res = await client.get(url, { headers: { accept: 'application/xml' }, params });
if (res.status < 200 || res.status >= 300) {
  console.error(`HTTP ${res.status}\n${res.body.slice(0, 800)}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(config.paths.metadata), { recursive: true });
fs.writeFileSync(config.paths.metadata, res.body, 'utf8');
console.log(`saved       : ${path.relative(process.cwd(), config.paths.metadata)} (${(res.body.length / 1024).toFixed(0)} KB)`);
