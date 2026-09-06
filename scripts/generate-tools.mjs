#!/usr/bin/env node
// Step 2: $metadata -> out/tools.json (deep-insert payloads). Sends nothing.
//   node scripts/generate-tools.mjs                 # scope from config.entitySets
//   node scripts/generate-tools.mjs --all           # all EntitySets
//   node scripts/generate-tools.mjs A_BusinessPartner A_Customer
//   node scripts/generate-tools.mjs --no-openai      # force template descriptions, even if USE_OPENAI_DESCRIPTIONS=true
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { parseEdmx } from './lib/edmx.mjs';
import { generateTools } from './lib/toolgen.mjs';
import { enrichWithOpenAI } from './lib/openai.mjs';

if (!fs.existsSync(config.paths.metadata)) {
  console.error(`Missing ${config.paths.metadata}. Run this first: node scripts/fetch-metadata.mjs`);
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
console.log(`scope       : ${scope.length} entity set(s)${all ? ' (--all)' : ''}`);

let tools = generateTools(model, config, scope);

// Descriptions (ToolDesc/ParamDesc): template from toolgen.mjs by default
// (offline, deterministic). With USE_OPENAI_DESCRIPTIONS=true in .env (and
// without --no-openai) they're overwritten with descriptions from OpenAI,
// generated from the same $metadata context - still offline with respect
// to SAP, nothing is POSTed yet.
if (config.openai.enabled && !noOpenai) {
  if (!config.openai.apiKey) {
    console.error('USE_OPENAI_DESCRIPTIONS=true, but OPENAI_API_KEY is missing from .env. Skipping description enrichment.');
  } else {
    console.log(`\ndescriptions: OpenAI (${config.openai.model}), ${tools.length} tool(s)`);
    tools = await enrichWithOpenAI(tools, config.openai, config.limits);
  }
} else {
  console.log('\ndescriptions: template (offline) - set USE_OPENAI_DESCRIPTIONS=true in .env to use OpenAI');
}

fs.mkdirSync(path.dirname(config.paths.tools), { recursive: true });
fs.writeFileSync(config.paths.tools, JSON.stringify(tools, null, 2), 'utf8');

const params = tools.reduce((n, t) => n + t.to_Parameters.length, 0);
console.log(`\ngenerated   : ${tools.length} tool(s), ${params} parameter(s)`);
console.log(`saved       : ${path.relative(process.cwd(), config.paths.tools)}`);
console.log('\npreview:');
for (const t of tools.slice(0, 10)) {
  console.log(`  ${t.ToolName.padEnd(42)} ${t.EntitySet}${t.NavigationProp ? '/' + t.NavigationProp : ''} (${t.to_Parameters.length}p)`);
}
if (tools.length > 10) console.log(`  ... +${tools.length - 10} more`);
console.log(`\nreview the file, then send it: node scripts/post-tools.mjs --dry-run`);
