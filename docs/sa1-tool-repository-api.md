# SAP OData Tool Repository (system SA1, klient 300)

Serwis OData na systemie SAP `SA1_300` sluzacy do przechowywania i udostepniania
dynamicznie definiowanych narzedzi (tools) OData.

Serwis pelni role **repozytorium narzedzi dla agentow AI**. Definicje narzedzi
sa generowane z `$metadata` serwisow OData (np. `API_BUSINESS_PARTNER`),
zapisywane w SAP, a nastepnie ladowane dynamicznie przez agenta w runtime.

## Podstawowe dane

| | |
|---|---|
| System / klient | `SA1`, mandant `300` |
| Destination BTP | `SA1_300` |
| Sciezka serwisu | `/sap/opu/odata/sap/<Z..._SRV>` - **uzupelnij w `.env` jako `TOOL_REPO_SERVICE_PATH`** |
| Protokol | OData V2 (SAP Gateway) |
| Format | JSON (`Accept: application/json`) |
| Modyfikacje | wymagaja tokenu CSRF |

## Model danych

### Tool

Glowna definicja narzedzia OData.

| Pole | Opis |
|---|---|
| `ToolId` | Unikalny identyfikator narzedzia (**nadawany przez backend**, nie wysylaj) |
| `ToolName` | Nazwa wystawiana agentowi AI |
| `ToolDesc` | Opis narzedzia |
| `ServiceName` | Serwis SAP OData, np. `API_BUSINESS_PARTNER` |
| `EntitySet` | EntitySet OData |
| `HTTPMethod` | Metoda HTTP, np. `GET` |
| `NavigationProp` | Opcjonalna navigation property |
| `SelectFields` | Pola uzywane w `$select` |
| `FilterTemplate` | Opcjonalny szablon filtra OData |
| `Active` | Czy narzedzie jest dostepne (`X` = aktywne) |

Tabela SAP: `ZXXXX_OD_TOOL`

### ToolParameter

Definiuje parametry wejsciowe wymagane przez narzedzie.

| Pole | Opis |
|---|---|
| `ToolId` | Referencja do Tool (wypelniana przez backend przy deep insert) |
| `ParamName` | Nazwa parametru wystawiana agentowi |
| `ParamDesc` | Opis parametru |
| `ParamType` | Typ parametru |
| `ODataProperty` | Odpowiadajaca property OData |
| `ParamUsage` | Zastosowanie, np. `KEY`, `FILTER` |
| `IsRequired` | Czy parametr jest wymagany (`X` = tak) |
| `Pos` | Pozycja parametru |
| `DefaultValue` | Opcjonalna wartosc domyslna |

Tabela SAP: `ZXXXX_OD_TOOL_P`

Relacja: Tool `1:N` ToolParameter
Navigation property: `to_Parameters`

## Tworzenie narzedzia

Narzedzia i ich parametry tworzy sie jednym **deep insertem** OData.

```
POST /ToolSet
Content-Type: application/json
Accept: application/json
x-csrf-token: <token>
```

```json
{
  "ToolName": "get_business_partner_address",
  "ToolDesc": "Get address data for a SAP Business Partner",
  "ServiceName": "API_BUSINESS_PARTNER",
  "EntitySet": "A_BusinessPartner",
  "HTTPMethod": "GET",
  "NavigationProp": "to_BusinessPartnerAddress",
  "SelectFields": "AddressID,CityName,StreetName,PostalCode",
  "FilterTemplate": "",
  "Active": "X",
  "to_Parameters": [
    {
      "ParamName": "businessPartner",
      "ParamDesc": "SAP Business Partner number",
      "ParamType": "STRING",
      "ODataProperty": "BusinessPartner",
      "ParamUsage": "KEY",
      "IsRequired": "X",
      "Pos": "001",
      "DefaultValue": ""
    }
  ]
}
```

`ToolId` jest generowany automatycznie przez backend SAP i przypisywany do
narzedzia oraz wszystkich powiazanych parametrow.

### Token CSRF

OData V2 wymaga tokenu CSRF do kazdej operacji modyfikujacej:

```
GET /sap/opu/odata/sap/<Z..._SRV>/     x-csrf-token: Fetch
   -> odpowiedz: naglowek x-csrf-token + ciasteczka sesji
POST /ToolSet                          x-csrf-token: <token>  + te same ciasteczka
```

Bez tego SAP zwroci `403 CSRF token validation failed`.
W pipeline zalatwia to `scripts/post-tools.mjs`: Cloud SDK robi to sam
(`fetchCsrfToken: true`), a fallback pobiera token recznie.

## Odczyt narzedzi

Wszystkie narzedzia:

```
GET /ToolSet
```

Narzedzia razem z parametrami (to konsumuje agent):

```
GET /ToolSet?$expand=to_Parameters
```

Same parametry:

```
GET /ToolParameterSet
```

Przydatne warianty:

```
GET /ToolSet?$filter=Active eq 'X'&$expand=to_Parameters
GET /ToolSet?$filter=ServiceName eq 'API_BUSINESS_PARTNER'
GET /ToolSet('<ToolId>')?$expand=to_Parameters
```

Odpowiedz OData V2:

```json
{ "d": { "results": [ { "ToolId": "...", "to_Parameters": { "results": [ ... ] } } ] } }
```

## Semantyka pol przy wywolaniu narzedzia

Agent, majac rekord Tool + jego ToolParameter, sklada wywolanie OData tak:

| Sytuacja | Efekt |
|---|---|
| `ParamUsage = KEY`, brak `NavigationProp` | `/{EntitySet}('{wartosc}')?$select={SelectFields}` |
| `ParamUsage = KEY`, jest `NavigationProp` | `/{EntitySet}('{wartosc}')/{NavigationProp}?$select={SelectFields}` |
| klucz zlozony (wiele `KEY`) | `/{EntitySet}(Key1='a',Key2='b')` - kolejnosc wg `Pos` |
| `ParamUsage = FILTER` | wartosci wstawiane w `FilterTemplate` lub sklejane w `$filter` |
| `IsRequired = X` | agent musi miec wartosc, inaczej nie wola narzedzia |
| `Active <> 'X'` | narzedzie pomijane przy ladowaniu |

`FilterTemplate` generowany przez pipeline uzywa placeholderow `{paramName}`,
np. `BusinessPartnerCategory eq '{businessPartnerCategory}'`.

## Limity dlugosci pol

Wartosci sa obcinane po stronie skryptu do limitow z `.env`
(`LIMIT_TOOL_NAME`, `LIMIT_SELECT_FIELDS`, ...). Domyslne wartosci sa
**zgadywane** - ustaw je zgodnie z faktycznymi dlugosciami w DDIC
(`ZXXXX_OD_TOOL`, `ZXXXX_OD_TOOL_P`), inaczej SAP odrzuci zbyt dlugie wartosci
albo je utnie po cichu.

## Typowe bledy

| HTTP | Komunikat | Przyczyna |
|---|---|---|
| 403 | `CSRF token validation failed` | brak / wygasly token albo brak ciasteczek sesji |
| 400 | `Property 'X' is not valid` | nazwa pola w payloadzie nie zgadza sie z modelem serwisu |
| 400 | deep insert odrzucony | `to_Parameters` nie jest obslugiwane w `CREATE_DEEP_ENTITY` w backendzie |
| 404 | - | zla `TOOL_REPO_SERVICE_PATH` albo serwis nieaktywowany w `/IWFND/MAINT_SERVICE` |
| 500 | `Duplicate key` | narzedzie o tej nazwie juz istnieje (uzyj innej `ToolName`) |
