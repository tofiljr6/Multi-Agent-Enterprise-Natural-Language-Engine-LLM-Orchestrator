// Minimal EDMX (OData V2) parser - no dependencies.
// Extracts what the tool generator needs: EntitySets, EntityTypes (keys,
// properties, navigation properties), and Associations to resolve
// navigation targets.

const ATTR_RE = /([\w:.-]+)\s*=\s*"([^"]*)"/g;

function attrs(tagBody) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(tagBody)) !== null) out[m[1]] = m[2];
  return out;
}

const local = (qualified = '') => qualified.split('.').pop();

/** @param {string} xml */
export function parseEdmx(xml) {
  const namespace = /<(?:\w+:)?Schema\b[^>]*\bNamespace="([^"]+)"/.exec(xml)?.[1] ?? '';

  // --- Association: name -> { role: {type, multiplicity} } ---------------
  const associations = new Map();
  const assocRe = /<(?:\w+:)?Association\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Association>/g;
  for (const m of xml.matchAll(assocRe)) {
    const a = attrs(m[1]);
    const ends = {};
    for (const e of m[2].matchAll(/<(?:\w+:)?End\b([^>]*?)\/?>/g)) {
      const ea = attrs(e[1]);
      if (ea.Role) ends[ea.Role] = { type: local(ea.Type), multiplicity: ea.Multiplicity ?? '1' };
    }
    associations.set(a.Name, { name: a.Name, ends });
  }

  // --- EntityType ---------------------------------------------------------
  const entityTypes = new Map();
  const etRe = /<(?:\w+:)?EntityType\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?EntityType>/g;
  for (const m of xml.matchAll(etRe)) {
    const a = attrs(m[1]);
    const inner = m[2];

    const keyBlock = /<(?:\w+:)?Key>([\s\S]*?)<\/(?:\w+:)?Key>/.exec(inner)?.[1] ?? '';
    const keys = [...keyBlock.matchAll(/<(?:\w+:)?PropertyRef\b([^>]*?)\/?>/g)]
      .map((k) => attrs(k[1]).Name)
      .filter(Boolean);

    const properties = [...inner.matchAll(/<(?:\w+:)?Property\b([^>]*?)\/?>/g)].map((p) => {
      const pa = attrs(p[1]);
      return {
        name: pa.Name,
        type: pa.Type ?? 'Edm.String',
        maxLength: pa.MaxLength ? Number(pa.MaxLength) : undefined,
        nullable: pa.Nullable !== 'false',
        label: pa['sap:label'] ?? '',
        filterable: pa['sap:filterable'] !== 'false',
        isKey: keys.includes(pa.Name),
      };
    });

    const navigation = [...inner.matchAll(/<(?:\w+:)?NavigationProperty\b([^>]*?)\/?>/g)].map((n) => {
      const na = attrs(n[1]);
      const assoc = associations.get(local(na.Relationship));
      const end = assoc?.ends?.[na.ToRole];
      return {
        name: na.Name,
        targetType: end?.type ?? '',
        multiplicity: end?.multiplicity ?? '',
        isCollection: end?.multiplicity === '*',
      };
    });

    entityTypes.set(a.Name, { name: a.Name, label: a['sap:label'] ?? '', keys, properties, navigation });
  }

  // --- EntitySet ----------------------------------------------------------
  const entitySets = [];
  for (const m of xml.matchAll(/<(?:\w+:)?EntitySet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (!a.Name || !a.EntityType) continue;
    entitySets.push({
      name: a.Name,
      entityType: local(a.EntityType),
      label: a['sap:label'] ?? '',
      addressable: a['sap:addressable'] !== 'false',
      creatable: a['sap:creatable'] !== 'false',
    });
  }

  return { namespace, entitySets, entityTypes, associations };
}
