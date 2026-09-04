#!/usr/bin/env node
// Krok 2: $metadata -> out/tools.json (payloady deep-insert). Nic nie wysyla.
//   node scripts/generate-tools.mjs                 # zakres z config.entitySets
//   node scripts/generate-tools.mjs --all           # wszystkie EntitySety
//   node scripts/generate-tools.mjs A_BusinessPartner A_Customer
//   node scripts/generate-tools.mjs --no-openai      # wymus szablonowe opisy, nawet gdy USE_OPENAI_DESCRIPTIONS=true
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { parseEdmx } from './lib/edmx.mjs';
import { generateTools } from './lib/toolgen.mjs';
import { enrichWithOpenAI } from './lib/openai.mjs';

if (!fs.existsSync(config.paths.metadata)) {
  console.error(`Brak ${config.paths.metadata}. Uruchom najpierw: node scripts/fetch-metadata.mjs`);
  process.exit(1);
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const noOpenai = args.includes('--no-openai');
const explicit = args.filter((a) => !a.startsWith('--'));

const model = parseEdmx(fs.readFileSync(config.paths.metadata, 'utf8'));
console.log(`namespace   : ${model.namespace}`);
console.log(`entity sets : ${model.entitySets.length}, entity types: ${model.entityTypes.size}`);

const scope = all
  ? model.entitySets.filter((s) => s.addressable).map((s) => s.name)
  : (explicit.length ? explicit : config.entitySets);
console.log(`zakres      : ${scope.length} entity set(s)${all ? ' (--all)' : ''}`);

let tools = generateTools(model, config, scope);

// Opisy (ToolDesc/ParamDesc): domyslnie szablon z toolgen.mjs (offline, deterministyczny).
// Z USE_OPENAI_DESCRIPTIONS=true w .env (i bez --no-openai) sa nadpisywane opisami
// z OpenAI, wygenerowanymi z tego samego kontekstu $metadata - wciaz offline
// wobec SAP, nic nie jest jeszcze POST-owane.
if (config.openai.enabled && !noOpenai) {
  if (!config.openai.apiKey) {
    console.error('USE_OPENAI_DESCRIPTIONS=true, ale brak OPENAI_API_KEY w .env. Pomijam wzbogacanie opisow.');
  } else {
    console.log(`\nopisy       : OpenAI (${config.openai.model}), ${tools.length} narzedzi`);
    tools = await enrichWithOpenAI(tools, config.openai, config.limits);
  }
} else {
  console.log('\nopisy       : szablonowe (offline) - ustaw USE_OPENAI_DESCRIPTIONS=true w .env, zeby uzyc OpenAI');
}

fs.mkdirSync(path.dirname(config.paths.tools), { recursive: true });
fs.writeFileSync(config.paths.tools, JSON.stringify(tools, null, 2), 'utf8');

const params = tools.reduce((n, t) => n + t.to_Parameters.length, 0);
console.log(`\nwygenerowano: ${tools.length} narzedzi, ${params} parametrow`);
console.log(`zapisano    : ${path.relative(process.cwd(), config.paths.tools)}`);
console.log('\npodglad:');
for (const t of tools.slice(0, 10)) {
  console.log(`  ${t.ToolName.padEnd(42)} ${t.EntitySet}${t.NavigationProp ? '/' + t.NavigationProp : ''} (${t.to_Parameters.length}p)`);
}
if (tools.length > 10) console.log(`  ... +${tools.length - 10}`);
console.log(`\nprzejrzyj plik, a nastepnie wyslij: node scripts/post-tools.mjs --dry-run`);
