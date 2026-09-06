# Mapping $metadata -> Tool / ToolParameter

Rules implemented in `scripts/lib/toolgen.mjs`.

## What comes out of one EntitySet

For `A_BusinessPartner` (type `A_BusinessPartnerType`, key `BusinessPartner`,
navigations `to_BusinessPartnerAddress`, `to_BusinessPartnerBank`):

| Tool | HTTPMethod | NavigationProp | Parameters |
|---|---|---|---|
| `get_business_partner` | GET | - | keys as `KEY` |
| `list_business_partner` | GET | - | up to 5 properties as `FILTER` |
| `get_business_partner_address` | GET | `to_BusinessPartnerAddress` | source keys as `KEY` |
| `get_business_partner_bank` | GET | `to_BusinessPartnerBank` | source keys as `KEY` |

Each kind can be turned off: `GEN_READ_BY_KEY`, `GEN_LIST`, `GEN_NAVIGATION`.

## Naming

| Source | Result |
|---|---|
| `A_BusinessPartner` | `A_` prefix stripped -> `business_partner` |
| `A_BusinessPartnerType` | `Type` suffix stripped |
| `to_BusinessPartnerAddress` on `A_BusinessPartner` | `to_` stripped + repeated entity prefix stripped -> `address` |
| `ToolName` | `get_` / `list_` + snake_case |
| `ParamName` | camelCase of the OData property, e.g. `BusinessPartner` -> `businessPartner` |

Names longer than `LIMIT_TOOL_NAME` are truncated at an `_` boundary, and
collisions are resolved with a `_2`, `_3` suffix.

## Parameter types

| EDM type | ParamType |
|---|---|
| `Edm.String`, `Edm.Guid`, `Edm.Binary` | `STRING` |
| `Edm.Boolean` | `BOOLEAN` |
| `Edm.Byte`, `Edm.SByte`, `Edm.Int16/32/64`, `Edm.Decimal`, `Edm.Double`, `Edm.Single` | `NUMBER` |
| `Edm.DateTime`, `Edm.DateTimeOffset` | `DATE` |
| `Edm.Time` | `TIME` |
| anything else | `STRING` |

## ParamUsage and IsRequired

| Source | ParamUsage | IsRequired |
|---|---|---|
| property from `<Key>` | `KEY` | `X` |
| filterable property (non-key) | `FILTER` | empty |

`Pos` is a sequence number `001`, `002`, ... - in the same order as in
`$metadata` (for keys: the order of `PropertyRef` inside `<Key>`, which
matters for composite keys).

## SelectFields

Keys always come first, then properties sorted by a "how descriptive is
this" heuristic: properties with a `sap:label`, of type `Edm.String` and
with `MaxLength <= 60` are favored; technical-looking ones (`Created*`,
`LastChange*`, `Authorization*`) are penalized. We take the first
`MAX_SELECT_FIELDS` (6 by default), truncated overall to
`LIMIT_SELECT_FIELDS` characters.

This is a heuristic - for important tools it's worth fixing `SelectFields`
by hand in `out/tools.json` before sending it off. Note that `SelectFields`
is stored for documentation purposes only: `srv/lib/toolExecutor.js`
(the runtime executor used by `AgentService`) deliberately ignores it and
always fetches the full record, because a bad guess here silently drops
data the agent needs (see [agent-service.md](agent-service.md)).

## FilterTemplate

`FILTER_TEMPLATE_STYLE=placeholders` (the default) builds a template out of
placeholders:

```
Customer eq '{customer}' and BusinessPartnerCategory eq '{businessPartnerCategory}'
```

Strings and dates are quoted, numbers and booleans are not.
`FILTER_TEMPLATE_STYLE=none` leaves `FilterTemplate` empty - in that case the
agent builds `$filter` itself from the parameters.

`get_*` tools (by key) and navigation tools always have an empty
`FilterTemplate`.

## Properties that are skipped

- properties with `sap:filterable="false"` - never become `FILTER` parameters
- `Created*`, `LastChange*` - skipped as filters (rarely useful for an agent)
- EntitySets with `sap:addressable="false"` - skipped with `--all`

## What the mapping does not do

- **GET only.** `HTTPMethod` is always `GET`; write tools have to be added by hand.
- **No `FunctionImport`** (function imports from `$metadata` are ignored).
- **No nested navigation** - only one level away from the source entity.
- **No descriptions from annotations** other than `sap:label`; `ToolDesc` is
  generated from a template (or, optionally, by OpenAI - see
  [scripts.md](scripts.md)), so for important tools it's worth rewriting it
  in language that actually helps the agent decide when to use the tool.
