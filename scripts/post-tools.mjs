#!/usr/bin/env node
// Krok 3: POST out/tools.json -> /ToolSet (OData V2 deep insert razem z to_Parameters).
//   node scripts/post-tools.mjs --dry-run     # pokaz payload, nic nie wysylaj
//   node scripts/post-tools.mjs --limit 1     # wyslij jedno narzedzie (smoke test)
//   node scripts/post-tools.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { createClient } from './lib/transport.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

if (!fs.existsSync(config.paths.tools)) {
  console.error(`Brak ${config.paths.tools}. Uruchom najpierw: node scripts/generate-tools.mjs`);
  process.exit(1);
}
const tools = JSON.parse(fs.readFileSync(config.paths.tools, 'utf8')).slice(0, limit);
const targetUrl = `${config.target.servicePath}/${config.target.entitySet}`;

if (dryRun) {
  console.log(`DRY RUN - ${tools.length} x POST ${targetUrl}\n`);
  console.log(JSON.stringify(tools[0], null, 2));
  if (tools.length > 1) console.log(`\n... i ${tools.length - 1} kolejnych. Nic nie wyslano.`);
  process.exit(0);
}

if (config.target.servicePath.includes('ZXXXX')) {
  console.error(
    'TOOL_REPO_SERVICE_PATH nadal ma placeholder ZXXXX_OD_TOOL_SRV.\n' +
    'Ustaw prawdziwa sciezke swojego serwisu w .env, np.:\n' +
    '  TOOL_REPO_SERVICE_PATH=/sap/opu/odata/sap/ZMTO_OD_TOOL_SRV'
  );
  process.exit(1);
}

const client = await createClient(config.destination);
console.log(`destination : ${await client.info()}`);
console.log(`target      : ${targetUrl}`);

const params = config.source.sapClient ? { 'sap-client': config.source.sapClient } : {};

// OData V2 wymaga tokenu CSRF do modyfikacji. Cloud SDK robi to sam (fetchCsrfToken),
// fallback musi pobrac token recznie z korzenia serwisu.
if (client.fetchCsrf) {
  const token = await client.fetchCsrf(config.target.servicePath, params);
  console.log(`csrf        : ${token ? 'pobrany' : 'BRAK - POST moze zwrocic 403'}`);
}

const results = [];
for (const [i, tool] of tools.entries()) {
  const res = await client.post(targetUrl, tool, { params });
  const ok = res.status >= 200 && res.status < 300;

  let toolId = '';
  let error = '';
  try {
    const j = JSON.parse(res.body);
    toolId = j?.d?.ToolId ?? '';
    error = j?.error?.message?.value ?? '';
  } catch {
    error = res.body.slice(0, 300);
  }

  console.log(`[${String(i + 1).padStart(3)}/${tools.length}] ${ok ? 'OK  ' : 'FAIL'} ${res.status} ${tool.ToolName}${toolId ? ` -> ToolId ${toolId}` : ''}`);
  if (!ok && error) console.log(`         ${error}`);
  results.push({ toolName: tool.ToolName, status: res.status, ok, toolId, error });
}

fs.mkdirSync(path.dirname(config.paths.result), { recursive: true });
fs.writeFileSync(config.paths.result, JSON.stringify(results, null, 2), 'utf8');

const okCount = results.filter((r) => r.ok).length;
console.log(`\ngotowe: ${okCount}/${results.length} utworzonych. Log: ${path.relative(process.cwd(), config.paths.result)}`);
process.exit(okCount === results.length ? 0 : 1);
