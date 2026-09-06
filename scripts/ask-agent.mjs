#!/usr/bin/env node
// Calls AgentService.ask (LangChain + tools from SA1_300) instead of a manual curl.
//   node scripts/ask-agent.mjs "Give me the business partner with number 1000000"
//   node scripts/ask-agent.mjs --url https://your-app.cfapps.eu10.hana.ondemand.com/odata/v4/agent/ask "..."
//
// The default URL is a local `cds watch` (http://localhost:4004). Override it
// with the --url flag or the AGENT_SERVICE_URL variable in .env.
import { config } from './config.mjs';

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const url = urlIdx >= 0
  ? args[urlIdx + 1]
  : (process.env.AGENT_SERVICE_URL ?? 'http://localhost:4004/odata/v4/agent/ask');

const query = args.filter((a, i) => a !== '--url' && i !== urlIdx + 1).join(' ').trim();

if (!query) {
  console.error('Usage: node scripts/ask-agent.mjs [--url <endpoint>] "<question>"');
  process.exit(1);
}

console.log(`endpoint : ${url}`);
console.log(`query    : ${query}\n`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query })
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = null;
}

if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(body?.error?.message ?? text.slice(0, 1000));
  process.exit(1);
}

if (body?.toolsAvailable) {
  console.log(`tools available (${body.toolsAvailable.length}): ${body.toolsAvailable.join(', ')}\n`);
}

if (body?.toolCalls?.length) {
  console.log(`tools called (${body.toolCalls.length}):`);
  for (const [i, c] of body.toolCalls.entries()) {
    console.log(`  [${i + 1}] ${c.tool}(${JSON.stringify(c.args ?? {})})`);
    console.log(`      -> ${c.output}`);
  }
  console.log();
} else if (body) {
  console.log('tools called: (none - the model answered without using a tool)\n');
}

console.log('answer:');
console.log(body?.answer ?? text);
