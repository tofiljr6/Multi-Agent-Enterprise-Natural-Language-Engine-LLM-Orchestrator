// Centralna konfiguracja pipeline'u.  Wartosci nadpisujesz przez .env / zmienne srodowiskowe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Prosty loader .env (bez zaleznosci). Nie nadpisuje juz ustawionych zmiennych. */
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

const env = process.env;

export const config = {
  destination: env.DESTINATION_NAME ?? 'SA1_300',

  // --- zrodlo: API_BUSINESS_PARTNER --------------------------------------
  source: {
    serviceName: env.SOURCE_SERVICE_NAME ?? 'API_BUSINESS_PARTNER',
    servicePath: env.SOURCE_SERVICE_PATH ?? '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
    sapClient: env.SAP_CLIENT ?? '300',
  },

  // --- cel: Twoj tool repository -----------------------------------------
  // UWAGA: TOOL_REPO_SERVICE_PATH musisz ustawic sam - to jedyna nieznana wartosc.
  // `configured` mowi, czy .env faktycznie ustawia ta zmienna - nie da sie
  // tego poznac po tresci wartosci, bo prawdziwa nazwa serwisu tez moze
  // zawierac "ZXXXX" (tak jak ZXXXX_KPI_SRV w srv/KpiToolService.js).
  target: {
    servicePath: env.TOOL_REPO_SERVICE_PATH ?? '/sap/opu/odata/sap/ZXXXX_OD_TOOL_SRV',
    configured: env.TOOL_REPO_SERVICE_PATH !== undefined,
    entitySet: env.TOOL_REPO_ENTITYSET ?? 'ToolSet',
    navigationProperty: 'to_Parameters',
  },

  // --- co generowac -------------------------------------------------------
  // Domyslnie waski zakres. `--all` w generate-tools.mjs ignoruje ta liste.
  entitySets: (env.ENTITY_SETS ?? 'A_BusinessPartner,A_Customer,A_Supplier')
    .split(',').map((s) => s.trim()).filter(Boolean),

  generate: {
    readByKey: env.GEN_READ_BY_KEY !== 'false',   // get_<encja>
    list: env.GEN_LIST !== 'false',               // list_<encja> z filtrami
    navigation: env.GEN_NAVIGATION !== 'false',   // get_<encja>_<nawigacja>
    maxFilterParams: Number(env.MAX_FILTER_PARAMS ?? 5),
    maxSelectFields: Number(env.MAX_SELECT_FIELDS ?? 6),
    filterTemplate: env.FILTER_TEMPLATE_STYLE ?? 'placeholders', // 'placeholders' | 'none'
  },

  // --- opisy (ToolDesc / ParamDesc) generowane przez OpenAI zamiast szablonu ---
  openai: {
    enabled: env.USE_OPENAI_DESCRIPTIONS === 'true',
    apiKey: env.OPENAI_API_KEY ?? '',
    model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },

  // --- limity dlugosci pol w tabelach SAP (ZXXXX_OD_TOOL / ZXXXX_OD_TOOL_P)
  // Dostosuj do faktycznych dlugosci w DDIC, inaczej SAP utnie/odrzuci wartosci.
  limits: {
    toolName: Number(env.LIMIT_TOOL_NAME ?? 40),
    toolDesc: Number(env.LIMIT_TOOL_DESC ?? 255),
    selectFields: Number(env.LIMIT_SELECT_FIELDS ?? 255),
    filterTemplate: Number(env.LIMIT_FILTER_TEMPLATE ?? 255),
    paramName: Number(env.LIMIT_PARAM_NAME ?? 40),
    paramDesc: Number(env.LIMIT_PARAM_DESC ?? 255),
  },

  paths: {
    metadata: env.METADATA_FILE ?? path.join(ROOT, '.cache', `${env.SOURCE_SERVICE_NAME ?? 'API_BUSINESS_PARTNER'}.metadata.xml`),
    tools: path.join(ROOT, 'out', 'tools.json'),
    result: path.join(ROOT, 'out', 'post-result.json'),
  },
};
