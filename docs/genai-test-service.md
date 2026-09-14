# GenAiTestService - trying out the "genai-dest" destination

A standalone, throwaway test service, separate from `AgentService`. It does
**not** use LangChain or the SA1_300 tool catalog - it only sends a prompt
straight to SAP AI Core / Generative AI Hub's **Orchestration Service**
(`POST /v2/completion`) through a destination named `genai-dest`, and
returns the raw response. Use it to verify that the destination, resource
group and model name are set up correctly before wiring GenAI Hub into
anything real (e.g. swapping it in for `ChatOpenAI` in `AgentService.js`).

```
POST /odata/v4/genai-test/ask   { "query": "...", "modelName": "gpt-4o-mini" }
        |
        v
  askGenAiHub()                 getDestination("genai-dest") + POST /v2/completion
        |                       (Orchestration Service, AI-Resource-Group header)
        v
  { content, raw }
```

## Files

| File | Role |
|---|---|
| `srv/GenAiTestService.cds` | `action ask(query: String, modelName: String) returns LargeString` |
| `srv/GenAiTestService.js` | Calls `askGenAiHub()` and returns `{ content, raw }` as JSON |
| `srv/lib/genAiClient.js` | `askGenAiHub()` - builds the Orchestration Service request and resolves the destination via `@sap-cloud-sdk/connectivity` |

## Configuration

Needs a destination named **`genai-dest`** pointing at your SAP AI Core
service instance's base URL (the Orchestration Service base URL, typically
`https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com` or
similar, with OAuth2ClientCredentials auth against the AI Core service key).
Resolved the same way as `SA1_300` (see
[destination-sa1-300.md](destination-sa1-300.md)):

- **On BTP**: bind the Destination Service (+ Connectivity if OnPremise) and
  create a `genai-dest` destination pointing at AI Core, same as any other
  BTP destination.
- **Locally**: set a `destinations` env var including a `genai-dest` entry,
  same format as documented for `SA1_300` in `.env.example`.

Optional `.env` values (see `.env.example`):

```
GENAI_DESTINATION_NAME=genai-dest   # override only if you name the destination differently
GENAI_MODEL_NAME=gpt-4o-mini        # default model, overridable per-call via `modelName`
GENAI_RESOURCE_GROUP=default        # AI Core resource group
```

## Calling it

```bash
curl -X POST http://localhost:4004/odata/v4/genai-test/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "Say hello in one sentence."}'
```

Response:

```json
{
  "content": "Hello! I hope you're having a wonderful day.",
  "raw": { "...": "full Orchestration Service response, for debugging" }
}
```

## Notes / caveats

- This service is intentionally separate and disposable - it doesn't touch
  `AgentService` or the SA1_300 tool repository at all.
- The exact Orchestration Service request/response shape can drift between
  AI Core API versions; `genAiClient.js` tries a couple of known response
  paths (`orchestration_result.choices[0].message.content`, plain
  `choices[0]...`, `module_results.llm...`) and falls back to an empty
  string if none match - check `raw` in that case to see what actually came
  back and adjust `extractContent()`.
- If your destination targets a **specific model deployment** instead of the
  Orchestration Service, replace the call in `genAiClient.js` with a POST to
  `/v2/inference/deployments/{deploymentId}/chat/completions` (or whatever
  path that deployment exposes) - the destination resolution stays the same.
