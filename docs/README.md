# Documentation

| Document | Content |
|---|---|
| [sa1-tool-repository-api.md](sa1-tool-repository-api.md) | Your OData service on SA1_300 - data model, deep insert, reads, errors |
| [destination-sa1-300.md](destination-sa1-300.md) | How the scripts connect to SA1_300 (Cloud SDK and fallback), BTP and local configuration |
| [scripts.md](scripts.md) | Pipeline `$metadata` -> `tools.json` -> `POST /ToolSet` |
| [metadata-to-tool-mapping.md](metadata-to-tool-mapping.md) | Rules for mapping EDMX to Tool and ToolParameter |
| [agent-service.md](agent-service.md) | `AgentService.ask` - a LangChain agent that dynamically binds tools from SA1_300 |
| [chat-ui.md](chat-ui.md) | `app/chat` - a Fiori freestyle chat UI for AgentService, with a "Thinking" tool trace |

## What this is

A tool repository for AI agents, kept **in SAP**, not in the agent's code.

```
API_BUSINESS_PARTNER/$metadata          (SA1_300)
            |
            |  scripts/fetch-metadata.mjs
            v
     .cache/*.metadata.xml
            |
            |  scripts/generate-tools.mjs      <- mapping rules
            v
        out/tools.json                          (deep insert payloads)
            |
            |  scripts/post-tools.mjs
            v
   POST /ToolSet  ->  ZXXXX_OD_TOOL + ZXXXX_OD_TOOL_P   (SA1_300)
            |
            v
      the agent reads GET /ToolSet?$expand=to_Parameters
      and builds its tool definitions from it at runtime
```

Both ends - the metadata source and the tool repository - sit on the same
destination, `SA1_300`.
