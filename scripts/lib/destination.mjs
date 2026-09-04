// Rozwiazywanie destination SA1_300.
//
// Dwa tryby:
//  1) BTP  - czyta VCAP_SERVICES, bierze token XSUAA i pyta Destination Service.
//            Dla ProxyType=OnPremise dokłada connectivity proxy + Proxy-Authorization.
//  2) LOKALNY - jesli ustawisz SA1_URL/SA1_USER/SA1_PASSWORD w .env, destination jest pomijane.
import { request, ensureOk, basicAuth } from './http.mjs';

const stripSlash = (u) => u.replace(/\/+$/, '');

function pickBinding(vcap, label) {
  for (const [key, list] of Object.entries(vcap)) {
    if (!Array.isArray(list)) continue;
    for (const b of list) {
      if (key === label || b.label === label || (b.tags ?? []).includes(label)) return b;
    }
  }
  return null;
}

async function clientCredentialsToken({ clientid, clientsecret, url }) {
  const res = await request(`${stripSlash(url)}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: basicAuth(clientid, clientsecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  ensureOk(res, `Token XSUAA (${url})`);
  return JSON.parse(res.body).access_token;
}

/**
 * @param {string} name np. "SA1_300"
 * @returns {Promise<{name:string,url:string,headers:Record<string,string>,proxy?:string,source:string}>}
 */
export async function resolveDestination(name, env = process.env) {
  // --- tryb lokalny A: zmienna `destinations` w formacie SAP Cloud SDK ----
  // destinations=[{"name":"SA1_300","url":"https://host:44300","username":"USER","password":"PASS"}]
  if (env.destinations) {
    const list = JSON.parse(env.destinations);
    const d = list.find((x) => x.name === name);
    if (d) {
      const headers = {};
      if (d.username) headers.authorization = basicAuth(d.username, d.password ?? '');
      return { name, url: stripSlash(d.url), headers, proxy: d.proxy || undefined, source: 'env (destinations)' };
    }
  }

  // --- tryb lokalny B: bezposredni URL -----------------------------------
  if (env.SA1_URL) {
    const headers = {};
    if (env.SA1_USER) headers.authorization = basicAuth(env.SA1_USER, env.SA1_PASSWORD ?? '');
    return {
      name,
      url: stripSlash(env.SA1_URL),
      headers,
      proxy: env.SA1_PROXY || undefined,
      source: 'env (SA1_URL)',
    };
  }

  // --- tryb BTP -----------------------------------------------------------
  const vcap = JSON.parse(env.VCAP_SERVICES ?? '{}');
  const destBinding = pickBinding(vcap, 'destination');
  if (!destBinding) {
    throw new Error(
      `Nie udalo sie rozwiazac destination "${name}".\n` +
      'Brak bindingu "destination" w VCAP_SERVICES, brak zmiennej `destinations` i brak SA1_URL.\n' +
      'Uruchom w BTP z podpietym Destination Service albo skonfiguruj .env (patrz .env.example).'
    );
  }

  const destToken = await clientCredentialsToken(destBinding.credentials);
  const res = await request(
    `${stripSlash(destBinding.credentials.uri)}/destination-configuration/v1/destinations/${encodeURIComponent(name)}`,
    { headers: { authorization: `Bearer ${destToken}`, accept: 'application/json' } }
  );
  ensureOk(res, `Destination Service (${name})`);

  const payload = JSON.parse(res.body);
  const cfg = payload.destinationConfiguration ?? {};
  if (!cfg.URL) throw new Error(`Destination ${name} nie ma pola URL.`);

  const headers = {};
  const token = payload.authTokens?.[0];
  if (token?.value) headers.authorization = `${token.type} ${token.value}`;
  else if (cfg.User) headers.authorization = basicAuth(cfg.User, cfg.Password ?? '');

  let proxy;
  if (cfg.ProxyType === 'OnPremise') {
    const connBinding = pickBinding(vcap, 'connectivity');
    if (!connBinding) {
      throw new Error(`Destination ${name} ma ProxyType=OnPremise, ale brak bindingu "connectivity" w VCAP_SERVICES.`);
    }
    const c = connBinding.credentials;
    proxy = `http://${c.onpremise_proxy_host}:${c.onpremise_proxy_http_port ?? c.onpremise_proxy_port}`;
    headers['proxy-authorization'] = `Bearer ${await clientCredentialsToken(c)}`;
    if (cfg.CloudConnectorLocationId) {
      headers['sap-connectivity-scc-location_id'] = cfg.CloudConnectorLocationId;
    }
  }

  return { name, url: stripSlash(cfg.URL), headers, proxy, source: `destination-service (${cfg.ProxyType ?? 'Internet'})` };
}
