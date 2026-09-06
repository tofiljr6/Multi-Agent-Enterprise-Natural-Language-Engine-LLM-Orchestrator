# Pipeline: $metadata -> tools.json -> POST /ToolSet

Three independent steps. Each can be run on its own; between steps the
result sits on disk, so it can be reviewed and fixed before anything is
sent to SAP.

```
scripts/
  config.mjs              configuration + .env loader
  fetch-metadata.mjs      step 1: fetches $metadata through the destination
  generate-tools.mjs      step 2: EDMX -> out/tools.json (offline)
  post-tools.mjs          step 3: deep insert into /ToolSet
  ask-agent.mjs           calls AgentService.ask (see agent-service.md)
  lib/
    transport.mjs         Cloud SDK / fallback selection
    destination.mjs       destination lookup (fallback)
    http.mjs              HTTP client + forward proxy (fallback)
    edmx.mjs              OData V2 $metadata parser
    toolgen.mjs           EDMX -> Tool/ToolParameter mapping rules
    openai.mjs             optional descriptions (ToolDesc/ParamDesc) via OpenAI
```

No npm dependencies needed - Node 18+ is enough.

## Setup

```bash
cp .env.example .env
```

In `.env` you must set `TOOL_REPO_SERVICE_PATH` (the path of your Z...
service). As long as it still holds the `ZXXXX` placeholder, step 3 refuses
to send anything.

## Step 1 - fetch metadata

```bash
npm run metadata
```

```
destination : SA1_300 -> https://host:44300  [Cloud SDK, OnPremise]
GET         : /sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata
saved       : .cache/API_BUSINESS_PARTNER.metadata.xml (1843 KB)
```

## Step 2 - generate tool definitions

```bash
npm run tools:generate                                  # scope from ENTITY_SETS
node scripts/generate-tools.mjs A_BusinessPartner       # specific entity sets
node scripts/generate-tools.mjs --all                   # everything (careful: hundreds of tools)
```

```
namespace   : API_BUSINESS_PARTNER
entity sets : 41, entity types: 43
scope       : 1 entity set(s)
generated   : 4 tools, 8 parameters
saved       : out/tools.json
```

Nothing is sent to SAP. `out/tools.json` is a plain array of payloads - you
can edit it by hand before sending it off.

### Descriptions via OpenAI (optional)

By default `ToolDesc`/`ParamDesc` are template-based (offline, from
`toolgen.mjs`, using `sap:label` from `$metadata` when available). To
generate them through OpenAI instead:

```bash
# in .env:
USE_OPENAI_DESCRIPTIONS=true
OPENAI_API_KEY=sk-...

npm run tools:generate
```

One request per tool (the model sees the whole definition: entity, fields,
all parameters at once), still offline with respect to SAP - the result is
still loaded into `out/tools.json` and reviewed before step 3. `--no-openai`
forces the template even when `USE_OPENAI_DESCRIPTIONS=true` is set in
`.env`. Tools for which the OpenAI request fails keep their template
description (the log shows `SKIPPED (...)`), the rest of the
pipeline is not interrupted.

## Step 3 - send to the tool repository

```bash
npm run tools:preview                  # dry run: shows the first payload
node scripts/post-tools.mjs --limit 1  # smoke test on a single tool
npm run tools:post                     # everything
```

```
destination : SA1_300 -> https://host:44300  [Cloud SDK, OnPremise]
target      : /sap/opu/odata/sap/ZMTO_OD_TOOL_SRV/ToolSet
csrf        : fetched
[  1/4] OK   201 get_business_partner -> ToolId 0000000012
[  2/4] OK   201 list_business_partner -> ToolId 0000000013
...
done: 4/4 created. Log: out/post-result.json
```

Exit code 1 if anything failed. Details of every attempt land in
`out/post-result.json`.

## Verification

```
GET /sap/opu/odata/sap/<Z..._SRV>/ToolSet?$expand=to_Parameters&$format=json
```

## Operational notes

- **No deduplication on the SAP side.** Running `tools:post` again will
  create a second set of records, unless the backend enforces uniqueness on
  `ToolName`. Delete the old tools or rename them before re-running.
- **`--all` generates a lot.** `API_BUSINESS_PARTNER` has dozens of entity
  sets and lots of navigations; it's easy to end up with hundreds of tools
  that no agent can meaningfully handle. Keep the scope narrow and
  deliberate.
- **`.cache/` and `out/` are in `.gitignore`** - they're artifacts, not
  sources.
