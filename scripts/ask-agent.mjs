#!/usr/bin/env node
// Wywoluje AgentService.ask (LangChain + narzedzia z SA1_300) zamiast recznego curl.
//   node scripts/ask-agent.mjs "Podaj dane partnera biznesowego o numerze 1000000"
//   node scripts/ask-agent.mjs --url https://twoja-app.cfapps.eu10.hana.ondemand.com/odata/v4/agent/ask "..."
//
// Domyslny URL to lokalny `cds watch` (http://localhost:4004). Nadpisz go
// flaga --url albo zmienna AGENT_SERVICE_URL w .env.
import { config } from './config.mjs';

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const url = urlIdx >= 0
  ? args[urlIdx + 1]
  : (process.env.AGENT_SERVICE_URL ?? 'http://localhost:4004/odata/v4/agent/ask');

const query = args.filter((a, i) => a !== '--url' && i !== urlIdx + 1).join(' ').trim();

if (!query) {
  console.error('Uzycie: node scripts/ask-agent.mjs [--url <endpoint>] "<pytanie>"');
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
  console.log(`narzedzia dostepne (${body.toolsAvailable.length}): ${body.toolsAvailable.join(', ')}\n`);
}

if (body?.toolCalls?.length) {
  console.log(`wywolane narzedzia (${body.toolCalls.length}):`);
  for (const [i, c] of body.toolCalls.entries()) {
    console.log(`  [${i + 1}] ${c.tool}(${JSON.stringify(c.args ?? {})})`);
    console.log(`      -> ${c.output}`);
  }
  console.log();
} else if (body) {
  console.log('wywolane narzedzia: (zadne - model odpowiedzial bez uzycia narzedzia)\n');
}

console.log('odpowiedz:');
console.log(body?.answer ?? text);
