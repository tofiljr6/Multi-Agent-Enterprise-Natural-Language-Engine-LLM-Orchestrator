// Mapowanie $metadata OData -> payloady Tool + ToolParameter (deep insert do /ToolSet).

const EDM_TO_PARAM_TYPE = {
  'Edm.String': 'STRING', 'Edm.Guid': 'STRING', 'Edm.Binary': 'STRING',
  'Edm.Boolean': 'BOOLEAN',
  'Edm.Byte': 'NUMBER', 'Edm.SByte': 'NUMBER', 'Edm.Int16': 'NUMBER', 'Edm.Int32': 'NUMBER',
  'Edm.Int64': 'NUMBER', 'Edm.Decimal': 'NUMBER', 'Edm.Double': 'NUMBER', 'Edm.Single': 'NUMBER',
  'Edm.DateTime': 'DATE', 'Edm.DateTimeOffset': 'DATE', 'Edm.Time': 'TIME',
};

export const paramType = (edm) => EDM_TO_PARAM_TYPE[edm] ?? 'STRING';

/** BusinessPartnerAddress -> business_partner_address ; A_/to_ sa obcinane wyzej */
export function snake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/** BusinessPartnerAddress -> businessPartnerAddress (nazwa parametru dla agenta) */
export function camel(name) {
  const s = snake(name);
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const stripPrefix = (n) => n.replace(/^A_/, '').replace(/^to_/, '').replace(/Type$/, '');
const cut = (s, max) => (s.length <= max ? s : s.slice(0, max));

/** Przycina nazwe narzedzia na granicy '_', zeby nie ucinac slow w polowie. */
function cutName(s, max) {
  if (s.length <= max) return s;
  const hard = s.slice(0, max);
  const soft = hard.slice(0, hard.lastIndexOf('_'));
  return soft.length >= max * 0.6 ? soft : hard;
}

/**
 * to_BusinessPartnerAddress na A_BusinessPartner -> "address" (nie "business_partner_address"),
 * dzieki czemu nazwa narzedzia to get_business_partner_address, a nie ...partner_business_partner_...
 */
function navSuffix(navName, entityBase) {
  const nav = snake(stripPrefix(navName));
  if (nav === entityBase) return nav;
  const trimmed = nav.startsWith(`${entityBase}_`) ? nav.slice(entityBase.length + 1) : nav;
  return trimmed || nav;
}
const humanize = (n) => snake(stripPrefix(n)).replace(/_/g, ' ');

function label(entity, fallbackName) {
  return entity?.label?.trim() || humanize(fallbackName);
}

/** Buduje liste parametrow z propertiesow. */
function buildParams(props, usage, startPos = 1) {
  return props.map((p, i) => ({
    ParamName: camel(p.name),
    ParamDesc: p.label || `${usage === 'KEY' ? 'Key field' : 'Filter on'} ${p.name}`,
    ParamType: paramType(p.type),
    ODataProperty: p.name,
    ParamUsage: usage,
    IsRequired: usage === 'KEY' ? 'X' : '',
    Pos: String(startPos + i).padStart(3, '0'),
    DefaultValue: '',
  }));
}

/** Wybiera pola do $select: klucze + najbardziej "opisowe" property. */
function selectFields(type, max) {
  if (!type) return '';
  const keys = type.properties.filter((p) => p.isKey);
  const rest = type.properties
    .filter((p) => !p.isKey)
    .sort((a, b) => {
      // preferuj krotkie stringi z labelem (nazwy, miasta, kody) przed technicznymi
      const score = (p) => (p.label ? 0 : 1) + (p.type === 'Edm.String' ? 0 : 1) +
        ((p.maxLength ?? 999) > 60 ? 1 : 0) + (/^(Creat|Last|Change|Authorization)/.test(p.name) ? 2 : 0);
      return score(a) - score(b);
    });
  return [...keys, ...rest].slice(0, max).map((p) => p.name).join(',');
}

function filterTemplate(params, style, max) {
  if (style !== 'placeholders' || params.length === 0) return '';
  const t = params.map((p) => {
    const quoted = p.ParamType === 'STRING' || p.ParamType === 'DATE';
    return `${p.ODataProperty} eq ${quoted ? `'{${p.ParamName}}'` : `{${p.ParamName}}`}`;
  }).join(' and ');
  return cut(t, max);
}

/**
 * @returns {Array<object>} payloady gotowe do POST /ToolSet
 */
export function generateTools(model, cfg, entitySetNames) {
  const { limits, generate, source } = cfg;
  const tools = [];
  const used = new Map();

  const uniqueName = (base) => {
    let name = cutName(base, limits.toolName);
    if (!used.has(name)) { used.set(name, 1); return name; }
    const n = used.get(name) + 1;
    used.set(name, n);
    return cutName(`${name}_${n}`, limits.toolName);
  };

  const push = (t) => tools.push({
    ...t,
    ToolName: uniqueName(t.ToolName),
    ToolDesc: cut(t.ToolDesc, limits.toolDesc),
    SelectFields: cut(t.SelectFields, limits.selectFields),
    FilterTemplate: cut(t.FilterTemplate ?? '', limits.filterTemplate),
    to_Parameters: t.to_Parameters.map((p) => ({
      ...p,
      ParamName: cut(p.ParamName, limits.paramName),
      ParamDesc: cut(p.ParamDesc, limits.paramDesc),
    })),
  });

  for (const setName of entitySetNames) {
    const set = model.entitySets.find((s) => s.name === setName);
    if (!set) { console.warn(`  ! pomijam ${setName} - brak takiego EntitySet w $metadata`); continue; }
    const type = model.entityTypes.get(set.entityType);
    if (!type) { console.warn(`  ! pomijam ${setName} - brak EntityType ${set.entityType}`); continue; }

    const base = snake(stripPrefix(set.name));
    const keyProps = type.keys.map((k) => type.properties.find((p) => p.name === k)).filter(Boolean);
    const entityLabel = label(set, set.name) || label(type, type.name);

    // 1) odczyt po kluczu
    if (generate.readByKey && keyProps.length > 0) {
      push({
        ToolName: `get_${base}`,
        ToolDesc: `Read a single ${entityLabel} by key from SAP OData service ${source.serviceName}`,
        ServiceName: source.serviceName,
        EntitySet: set.name,
        HTTPMethod: 'GET',
        NavigationProp: '',
        SelectFields: selectFields(type, generate.maxSelectFields),
        FilterTemplate: '',
        Active: 'X',
        to_Parameters: buildParams(keyProps, 'KEY'),
      });
    }

    // 2) lista z filtrami
    if (generate.list) {
      const filterProps = type.properties
        .filter((p) => p.filterable && !p.isKey && !/^(Creat|Last|Change)/.test(p.name))
        .slice(0, generate.maxFilterParams);
      if (filterProps.length > 0) {
        const params = buildParams(filterProps, 'FILTER');
        push({
          ToolName: `list_${base}`,
          ToolDesc: `Search ${entityLabel} records in SAP OData service ${source.serviceName} using optional filters`,
          ServiceName: source.serviceName,
          EntitySet: set.name,
          HTTPMethod: 'GET',
          NavigationProp: '',
          SelectFields: selectFields(type, generate.maxSelectFields),
          FilterTemplate: filterTemplate(params, generate.filterTemplate, limits.filterTemplate),
          Active: 'X',
          to_Parameters: params,
        });
      }
    }

    // 3) nawigacje
    if (generate.navigation && keyProps.length > 0) {
      for (const nav of type.navigation) {
        const target = model.entityTypes.get(nav.targetType);
        if (!target) continue;
        push({
          ToolName: `get_${base}_${navSuffix(nav.name, base)}`,
          ToolDesc: `Read ${label(target, nav.targetType)} for a given ${entityLabel} via navigation ${nav.name}`,
          ServiceName: source.serviceName,
          EntitySet: set.name,
          HTTPMethod: 'GET',
          NavigationProp: nav.name,
          SelectFields: selectFields(target, generate.maxSelectFields),
          FilterTemplate: '',
          Active: 'X',
          to_Parameters: buildParams(keyProps, 'KEY'),
        });
      }
    }
  }

  return tools;
}
