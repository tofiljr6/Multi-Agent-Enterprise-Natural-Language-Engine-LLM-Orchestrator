# Dokumentacja

| Dokument | Zawartosc |
|---|---|
| [sa1-tool-repository-api.md](sa1-tool-repository-api.md) | Twoj serwis OData na SA1_300 - model danych, deep insert, odczyt, bledy |
| [destination-sa1-300.md](destination-sa1-300.md) | Jak skrypty lacza sie z SA1_300 (Cloud SDK i fallback), konfiguracja BTP i lokalna |
| [scripts.md](scripts.md) | Pipeline `$metadata` -> `tools.json` -> `POST /ToolSet` |
| [metadata-to-tool-mapping.md](metadata-to-tool-mapping.md) | Reguly mapowania EDMX na Tool i ToolParameter |

## Co to jest

Repozytorium narzedzi (tools) dla agentow AI, trzymane **w SAP**, nie w kodzie agenta.

```
API_BUSINESS_PARTNER/$metadata          (SA1_300)
            |
            |  scripts/fetch-metadata.mjs
            v
     .cache/*.metadata.xml
            |
            |  scripts/generate-tools.mjs      <- reguly mapowania
            v
        out/tools.json                          (payloady deep insert)
            |
            |  scripts/post-tools.mjs
            v
   POST /ToolSet  ->  ZXXXX_OD_TOOL + ZXXXX_OD_TOOL_P   (SA1_300)
            |
            v
      agent czyta GET /ToolSet?$expand=to_Parameters
      i buduje z tego swoje tool definitions w runtime
```

Oba konce - zrodlo metadanych i repozytorium narzedzi - siedza na tym samym
destination `SA1_300`.
