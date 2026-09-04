# Pipeline: $metadata -> tools.json -> POST /ToolSet

Trzy niezalezne kroki. Kazdy mozna uruchomic osobno; miedzy krokami efekt lezy
na dysku, wiec da sie go obejrzec i poprawic przed wyslaniem czegokolwiek do SAP.

```
scripts/
  config.mjs              konfiguracja + loader .env
  fetch-metadata.mjs      krok 1: pobiera $metadata przez destination
  generate-tools.mjs      krok 2: EDMX -> out/tools.json (offline)
  post-tools.mjs          krok 3: deep insert do /ToolSet
  lib/
    transport.mjs         wybor Cloud SDK / fallback
    destination.mjs       lookup destination (fallback)
    http.mjs              klient HTTP + forward proxy (fallback)
    edmx.mjs              parser $metadata OData V2
    toolgen.mjs           reguly mapowania EDMX -> Tool/ToolParameter
    openai.mjs             opcjonalne opisy (ToolDesc/ParamDesc) przez OpenAI
```

Zero zaleznosci npm - wystarczy Node 18+.

## Przygotowanie

```bash
cp .env.example .env
```

W `.env` obowiazkowo ustaw `TOOL_REPO_SERVICE_PATH` (sciezka Twojego serwisu Z...).
Dopoki jest tam placeholder `ZXXXX`, krok 3 odmawia wysylki.

## Krok 1 - pobierz metadane

```bash
npm run metadata
```

```
destination : SA1_300 -> https://host:44300  [Cloud SDK, OnPremise]
GET         : /sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata
zapisano    : .cache/API_BUSINESS_PARTNER.metadata.xml (1843 KB)
```

## Krok 2 - wygeneruj definicje narzedzi

```bash
npm run tools:generate                                  # zakres z ENTITY_SETS
node scripts/generate-tools.mjs A_BusinessPartner       # wskazane entity sety
node scripts/generate-tools.mjs --all                   # wszystko (uwaga: setki narzedzi)
```

```
namespace   : API_BUSINESS_PARTNER
entity sets : 41, entity types: 43
zakres      : 1 entity set(s)
wygenerowano: 4 narzedzi, 8 parametrow
zapisano    : out/tools.json
```

Nic nie leci do SAP. `out/tools.json` to zwykla tablica payloadow - mozesz ja
recznie poprawic przed wyslaniem.

### Opisy przez OpenAI (opcjonalnie)

Domyslnie `ToolDesc`/`ParamDesc` sa szablonowe (offline, z `toolgen.mjs`,
uzywaja `sap:label` z `$metadata` gdy jest dostepny). Zeby zamiast tego
wygenerowac je przez OpenAI:

```bash
# w .env:
USE_OPENAI_DESCRIPTIONS=true
OPENAI_API_KEY=sk-...

npm run tools:generate
```

Jeden request na narzedzie (model widzi cala definicje: encje, pola, wszystkie
parametry naraz), wciaz offline wobec SAP - wynik i tak ladujesz do
`out/tools.json` i przegladasz przed krokiem 3. `--no-openai` wymusza
szablon, nawet gdy `USE_OPENAI_DESCRIPTIONS=true` jest ustawione w `.env`.
Narzedzia, dla ktorych request do OpenAI sie nie powiedzie, zostaja z opisem
szablonowym (log pokazuje `POMINIETO (...)`), reszta pipeline'u nie jest
przerywana.

## Krok 3 - wyslij do repozytorium narzedzi

```bash
npm run tools:preview                  # dry run: pokazuje pierwszy payload
node scripts/post-tools.mjs --limit 1  # smoke test na jednym narzedziu
npm run tools:post                     # wszystko
```

```
destination : SA1_300 -> https://host:44300  [Cloud SDK, OnPremise]
target      : /sap/opu/odata/sap/ZMTO_OD_TOOL_SRV/ToolSet
csrf        : pobrany
[  1/4] OK   201 get_business_partner -> ToolId 0000000012
[  2/4] OK   201 list_business_partner -> ToolId 0000000013
...
gotowe: 4/4 utworzonych. Log: out/post-result.json
```

Kod wyjscia 1, gdy cokolwiek nie przeszlo. Szczegoly kazdej proby ladują
w `out/post-result.json`.

## Weryfikacja

```
GET /sap/opu/odata/sap/<Z..._SRV>/ToolSet?$expand=to_Parameters&$format=json
```

## Uwagi operacyjne

- **Brak deduplikacji po stronie SAP.** Ponowny `tools:post` utworzy drugi
  komplet rekordow, chyba ze backend pilnuje unikalnosci `ToolName`.
  Przed powtorka skasuj stare narzedzia albo zmien nazwy.
- **`--all` generuje bardzo duzo.** `API_BUSINESS_PARTNER` ma kilkadziesiat
  entity setow i mnostwo nawigacji; latwo zrobic kilkaset narzedzi, ktorych
  zaden agent sensownie nie ogarnie. Trzymaj waski, swiadomy zakres.
- **`.cache/` i `out/` sa w `.gitignore`** - to artefakty, nie zrodla.
