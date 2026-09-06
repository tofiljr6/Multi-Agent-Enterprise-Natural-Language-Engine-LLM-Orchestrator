# AgentService - LangChain agent z narzedziami z SA1_300

CAP service, ktory odpowiada na dowolne pytanie (`query`) przy pomocy LLM
(LangChain, `createAgent`), z narzedziami zaladowanymi **dynamicznie** przy
kazdym wywolaniu z repozytorium narzedzi na `SA1_300` (ten sam mechanizm co
`KpiToolService.getTools` - `GET ToolSet?$expand=to_Parameters`). Zaden tool
nie jest hardcodowany w kodzie agenta: dopisanie nowego narzedzia do SAP
(patrz [scripts.md](scripts.md) / [sa1-tool-repository-api.md](sa1-tool-repository-api.md))
sprawia, ze jest ono od razu dostepne dla agenta, bez deployu.

```
POST /odata/v4/agent/ask  { "query": "..." }
        |
        v
  fetchToolCatalog()        GET ToolSet?$expand=to_Parameters (SA1_300)
        |
        v
  toLangChainTools()        Tool + ToolParameter -> tool() z langchain
        |                   (schema = zod, func = wywolanie OData przez
        |                    ten sam destination, wg ParamUsage KEY/FILTER)
        v
  createAgent({model, tools}).invoke({messages: [...]})
        |
        v
  { answer, toolsAvailable, toolCalls }
```

## Pliki

| Plik | Rola |
|---|---|
| `srv/AgentService.cds` | `action ask(query: String) returns LargeString` |
| `srv/AgentService.js` | Buduje agenta LangChain i go wywoluje |
| `srv/lib/toolCatalog.js` | `fetchToolCatalog()` - GET ToolSet z SA1_300 |
| `srv/lib/toolExecutor.js` | `callSapTool()` - realne wywolanie OData dla jednego Tool |
| `srv/lib/agentTools.js` | `toLangChainTools()` - Tool/ToolParameter -> `tool()` LangChain |

## Konfiguracja

Wymagany `OPENAI_API_KEY` w `.env` (patrz `.env.example`) albo jako zmienna
srodowiskowa/user-provided service na BTP. Brak destination `SA1_300` (np.
lokalnie bez skonfigurowanego `destinations`) da blad przy pobieraniu
katalogu narzedzi - identycznie jak w `KpiToolService.getTools`.

## Wywolanie

```bash
curl -X POST http://localhost:4004/odata/v4/agent/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "Podaj dane partnera biznesowego o numerze 1000000"}'
```

Odpowiedz:

```json
{
  "answer": "...",
  "toolsAvailable": ["get_business_partner", "list_business_partner", "..."],
  "toolCalls": [
    { "tool": "get_business_partner", "output": "{\"BusinessPartner\":\"1000000\", ...}" }
  ]
}
```

Na BTP zamiast `localhost:4004` uzyj adresu wdrozonej aplikacji.
