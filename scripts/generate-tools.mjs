#!/usr/bin/env node
// Krok 2: $metadata -> out/tools.json (payloady deep-insert). Nic nie wysyla.
//   node scripts/generate-tools.mjs                 # zakres z config.entitySets
//   node scripts/generate-tools.mjs --all           # wszystkie EntitySety
//   node scripts/generate-tools.mjs A_BusinessPartner A_Customer
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { parseEdmx } from './lib/edmx.mjs';
import { generateTools } from './lib/toolgen.mjs';

if (!fs.existsSync(config.paths.metadata)) {
  console.error(`Brak ${config.paths.metadata}. Uruchom najpierw: node scripts/fetch-metadata.mjs`);
  process.exit(1);
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const explicit = args.filter((a) => !a.startsWith('--'));

const model = parseEdmx(fs.readFileSync(config.paths.metadata, 'utf8'));
console.log(`namespace   : ${model.namespace}`);
console.log(`entity sets : ${model.entitySets.length}, entity types: ${model.entityTypes.size}`);

const scope = all
  ? model.entitySets.filter((s) => s.addressable).map((s) => s.name)
  : (explicit.length ? explicit : config.entitySets);
console.log(`zakres      : ${scope.length} entity set(s)${all ? ' (--all)' : ''}`);

const tools = generateTools(model, config, scope);

fs.mkdirSync(path.dirname(config.paths.tools), { recursive: true });
fs.writeFileSync(config.paths.tools, JSON.stringify(tools, null, 2), 'utf8');

const params = tools.reduce((n, t) => n + t.to_Parameters.length, 0);
console.log(`wygenerowano: ${tools.length} narzedzi, ${params} parametrow`);
console.log(`zapisano    : ${path.relative(process.cwd(), config.paths.tools)}`);
console.log('\npodglad:');
for (const t of tools.slice(0, 10)) {
  console.log(`  ${t.ToolName.padEnd(42)} ${t.EntitySet}${t.NavigationProp ? '/' + t.NavigationProp : ''} (${t.to_Parameters.length}p)`);
}
if (tools.length > 10) console.log(`  ... +${tools.length - 10}`);
