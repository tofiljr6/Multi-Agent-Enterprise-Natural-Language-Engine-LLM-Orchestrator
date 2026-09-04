# Mapowanie $metadata -> Tool / ToolParameter

Reguly zaimplementowane w `scripts/lib/toolgen.mjs`.

## Co powstaje z jednego EntitySet

Dla `A_BusinessPartner` (typ `A_BusinessPartnerType`, klucz `BusinessPartner`,
nawigacje `to_BusinessPartnerAddress`, `to_BusinessPartnerBank`):

| Narzedzie | HTTPMethod | NavigationProp | Parametry |
|---|---|---|---|
| `get_business_partner` | GET | - | klucze jako `KEY` |
| `list_business_partner` | GET | - | do 5 property jako `FILTER` |
| `get_business_partner_address` | GET | `to_BusinessPartnerAddress` | klucze zrodla jako `KEY` |
| `get_business_partner_bank` | GET | `to_BusinessPartnerBank` | klucze zrodla jako `KEY` |

Kazdy typ mozna wylaczyc: `GEN_READ_BY_KEY`, `GEN_LIST`, `GEN_NAVIGATION`.

## Nazewnictwo

| Zrodlo | Wynik |
|---|---|
| `A_BusinessPartner` | prefiks `A_` usuwany -> `business_partner` |
| `A_BusinessPartnerType` | sufiks `Type` usuwany |
| `to_BusinessPartnerAddress` na `A_BusinessPartner` | `to_` usuwane + powtorzony prefiks encji usuwany -> `address` |
| `ToolName` | `get_` / `list_` + snake_case |
| `ParamName` | camelCase property OData, np. `BusinessPartner` -> `businessPartner` |

Nazwy dluzsze niz `LIMIT_TOOL_NAME` sa przycinane na granicy `_`, a kolizje
rozwiazywane sufiksem `_2`, `_3`.

## Typy parametrow

| Typ EDM | ParamType |
|---|---|
| `Edm.String`, `Edm.Guid`, `Edm.Binary` | `STRING` |
| `Edm.Boolean` | `BOOLEAN` |
| `Edm.Byte`, `Edm.SByte`, `Edm.Int16/32/64`, `Edm.Decimal`, `Edm.Double`, `Edm.Single` | `NUMBER` |
| `Edm.DateTime`, `Edm.DateTimeOffset` | `DATE` |
| `Edm.Time` | `TIME` |
| pozostale | `STRING` |

## ParamUsage i IsRequired

| Zrodlo | ParamUsage | IsRequired |
|---|---|---|
| property z `<Key>` | `KEY` | `X` |
| property filtrowalna (nie-klucz) | `FILTER` | pusty |

`Pos` to numer porzadkowy `001`, `002`, ... - kolejnosc taka jak w `$metadata`
(dla kluczy: kolejnosc `PropertyRef` w `<Key>`, co jest wazne przy kluczach zlozonych).

## SelectFields

Klucze zawsze na poczatku, potem property posortowane heurystyka
"jak bardzo opisowe": premiowane sa te z `sap:label`, typu `Edm.String`
i `MaxLength <= 60`; karane techniczne (`Created*`, `LastChange*`,
`Authorization*`). Bierzemy pierwsze `MAX_SELECT_FIELDS` (domyslnie 6),
calosc przycinana do `LIMIT_SELECT_FIELDS` znakow.

To heurystyka - dla kluczowych narzedzi warto poprawic `SelectFields` recznie
w `out/tools.json` przed wyslaniem.

## FilterTemplate

`FILTER_TEMPLATE_STYLE=placeholders` (domyslnie) sklada szablon z placeholderow:

```
Customer eq '{customer}' and BusinessPartnerCategory eq '{businessPartnerCategory}'
```

Stringi i daty w apostrofach, liczby i booleany bez. `FILTER_TEMPLATE_STYLE=none`
zostawia `FilterTemplate` puste - wtedy agent sklada `$filter` sam z parametrow.

Narzedzia `get_*` (po kluczu) i nawigacyjne zawsze maja `FilterTemplate` puste.

## Property pomijane

- z `sap:filterable="false"` - nie trafiaja do parametrow `FILTER`
- `Created*`, `LastChange*` - pomijane jako filtry (rzadko sensowne dla agenta)
- EntitySety z `sap:addressable="false"` - pomijane przy `--all`

## Czego mapowanie nie robi

- **Tylko GET.** `HTTPMethod` zawsze `GET`; narzedzia zapisujace trzeba dodac recznie.
- **Bez funkcji importow** (`FunctionImport` z `$metadata` jest ignorowany).
- **Bez nawigacji zagniezdzonych** - tylko jeden poziom od encji zrodlowej.
- **Bez opisow z anotacji** innych niz `sap:label`; `ToolDesc` jest generowany
  szablonowo, wiec dla waznych narzedzi warto go przepisac na jezyk, ktorym
  agent ma sie kierowac przy wyborze narzedzia.
