#!/usr/bin/env node
// Standalone test of the "genai-dest" destination - no cds watch / BAS URL
// / curl needed. Resolves the destination directly (same transport.mjs used
// by fetch-metadata.mjs etc.) and calls SAP AI Core / Generative AI Hub's
// Orchestration Service (POST /v2/completion).
//
//   node scripts/test-genai.mjs "Say hello in one sentence."
//   node scripts/test-genai.mjs --model gpt-4o "..."
//
// Configuration (.env, see .env.example):
//   GENAI_DESTINATION_NAME=genai-dest
//   GENAI_MODEL_NAME=gpt-4o-mini
//   GENAI_RESOURCE_GROUP=default
import { config } from './config.mjs';
import { createClient } from './lib/transport.mjs';

const args = process.argv.slice(2);
const modelIdx = args.indexOf('--model');
const modelName = modelIdx >= 0 ? args[modelIdx + 1] : config.genai.modelName;
const query = (modelIdx >= 0 ? args.filter((_, i) => i !== modelIdx && i !== modelIdx + 1) : args)
  .join(' ').trim();

if (!query) {
  console.error('Usage: node scripts/test-genai.mjs [--model <name>] "<prompt>"');
  process.exit(1);
}

console.log(`destination : ${config.genai.destination}`);
console.log(`model       : ${modelName}`);
console.log(`prompt      : ${query}\n`);

const client = await createClient(config.genai.destination);
console.log(`resolved    : ${await client.info()}\n`);

const body = {
  orchestration_config: {
    module_configurations: {
      llm_module_config: {
        model_name: modelName,
        model_params: { temperature: 0.2, max_tokens: 500 },
      },
      templating_module_config: {
        template: [{ role: 'user', content: '{{?input}}' }],
      },
    },
  },
  input_params: { input: query },
};

const res = await client.post('/v2/completion', body, {
  headers: { 'AI-Resource-Group': config.genai.resourceGroup },
});

console.log(`HTTP status : ${res.status}\n`);

let parsed;
try {
  parsed = JSON.parse(res.body);
} catch {
  console.log('raw body (not JSON):');
  console.log(res.body.slice(0, 2000));
  process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
}

if (res.status < 200 || res.status >= 300) {
  console.error('request failed:');
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

const content =
  parsed?.orchestration_result?.choices?.[0]?.message?.content ??
  parsed?.choices?.[0]?.message?.content ??
  parsed?.module_results?.llm?.choices?.[0]?.message?.content ??
  '(could not find content in the response - see raw JSON below)';

console.log('content:');
console.log(content);
console.log('\nraw response:');
console.log(JSON.stringify(parsed, null, 2));
