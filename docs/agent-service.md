# AgentService - a LangChain agent with tools from SA1_300

A CAP service that answers any question (`query`) using an LLM (LangChain,
`createAgent`), with tools loaded **dynamically** on every call from the
tool repository on `SA1_300` (the same mechanism as
`KpiToolService.getTools` - `GET ToolSet?$expand=to_Parameters`). No tool is
hardcoded in the agent's code: adding a new tool in SAP (see
[scripts.md](scripts.md) / [sa1-tool-repository-api.md](sa1-tool-repository-api.md))
makes it available to the agent immediately, with no redeploy.

```
POST /odata/v4/agent/ask  { "query": "..." }
        |
        v
  fetchToolCatalog()        GET ToolSet?$expand=to_Parameters (SA1_300)
        |
        v
  toLangChainTools()        Tool + ToolParameter -> tool() from langchain
        |                   (schema = zod, func = an OData call through
        |                    the same destination, per ParamUsage KEY/FILTER)
        v
  createAgent({model, tools}).invoke({messages: [...]})
        |
        v
  { answer, toolsAvailable, toolCalls }
```

## Files

| File | Role |
|---|---|
| `srv/AgentService.cds` | `action ask(query: String) returns LargeString` |
| `srv/AgentService.js` | Builds and invokes the LangChain agent |
| `srv/lib/toolCatalog.js` | `fetchToolCatalog()` - GET ToolSet from SA1_300 |
| `srv/lib/toolExecutor.js` | `callSapTool()` - the actual OData call for one Tool |
| `srv/lib/agentTools.js` | `toLangChainTools()` - Tool/ToolParameter -> LangChain `tool()` |

Note on `srv/lib/toolExecutor.js`: it deliberately ignores the `SelectFields`
stored on the Tool and always fetches the full record. `SelectFields` is
picked by a heuristic at generation time (see
[metadata-to-tool-mapping.md](metadata-to-tool-mapping.md)) and can miss the
exact columns a user is asking about (e.g. it once picked technical address
fields over `StreetName`/`CityName`) - since `$select` truncates the OData
response on the server side, a bad guess there is a silent, unrecoverable
loss of data for the model. Fetching the full record costs a bit more
payload but removes that entire failure mode.

## Configuration

Requires `OPENAI_API_KEY` in `.env` (see `.env.example`), or as an
environment variable / user-provided service on BTP. A missing `SA1_300`
destination (e.g. locally without `destinations` configured) will fail when
fetching the tool catalog - exactly like in `KpiToolService.getTools`.

## Calling it

```bash
npm run agent:ask -- "Give me the business partner with number 1000000"

# or against another instance (e.g. on BTP):
node scripts/ask-agent.mjs --url https://your-app.cfapps.eu10.hana.ondemand.com/odata/v4/agent/ask "..."
```

The default endpoint is a local `cds watch`
(`http://localhost:4004/odata/v4/agent/ask`); override it with `--url` or
`AGENT_SERVICE_URL` in `.env`.

```
endpoint : http://localhost:4004/odata/v4/agent/ask
query    : Give me the business partner with number 1000000

tools available (4): get_business_partner, list_business_partner, ...

tools called (1):
  [1] get_business_partner({"businessPartner":"1000000"})
      -> {"BusinessPartner":"1000000", ...}

answer:
...
```

The same tool call info (`[agent] tool ...(...) -> ...`) is also logged
server-side, in the `cds watch` terminal.

Plain curl works too, if you prefer it:

```bash
curl -X POST http://localhost:4004/odata/v4/agent/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "Give me the business partner with number 1000000"}'
```
