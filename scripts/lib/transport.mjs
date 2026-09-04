// Warstwa transportu do systemu SAP przez destination.
//
// Dwie implementacje, wybierane automatycznie:
//   1) SAP Cloud SDK  - gdy sa zainstalowane @sap-cloud-sdk/connectivity + /http-client.
//      Ten sam wzorzec co w projekcie business-partner-ai (srv/lib/bpClient.js):
//         const destination = await getDestination({ destinationName: 'SA1_300' })
//         await executeHttpRequest(destination, { method, url, params })
//      Cloud SDK sam ogarnia XSUAA, connectivity proxy (OnPremise), principal propagation
//      oraz lokalna zmienna `destinations=[{...}]`.
//   2) Fallback wbudowany - zero zaleznosci (node:http + wlasny lookup destination).
//      Dziala bez npm install; obsluguje VCAP_SERVICES, `destinations` i SA1_URL.
//
// Wymus konkretna implementacje: TRANSPORT=cloud-sdk | builtin
import { resolveDestination } from './destination.mjs';
import { request, ensureOk, cookieHeader } from './http.mjs';

async function tryLoadCloudSdk() {
  if (process.env.TRANSPORT === 'builtin') return null;
  try {
    const [connectivity, httpClient] = await Promise.all([
      import('@sap-cloud-sdk/connectivity'),
      import('@sap-cloud-sdk/http-client'),
    ]);
    return { getDestination: connectivity.getDestination, executeHttpRequest: httpClient.executeHttpRequest };
  } catch {
    if (process.env.TRANSPORT === 'cloud-sdk') {
      throw new Error('TRANSPORT=cloud-sdk, ale brak @sap-cloud-sdk/connectivity i @sap-cloud-sdk/http-client.');
    }
    return null;
  }
}

const asBody = (data) => (typeof data === 'string' ? data : JSON.stringify(data ?? ''));

function cloudSdkClient({ getDestination, executeHttpRequest }, destinationName) {
  let destination;
  const dest = async () => (destination ??= await getDestination({ destinationName }));

  const call = async (method, url, { headers = {}, params = {}, body, csrf = false } = {}) => {
    try {
      const res = await executeHttpRequest(
        await dest(),
        { method, url, headers, params, ...(body !== undefined ? { data: body } : {}) },
        { fetchCsrfToken: csrf }
      );
      return { status: res.status, headers: res.headers ?? {}, cookies: [], body: asBody(res.data) };
    } catch (err) {
      const r = err?.response ?? err?.cause?.response;
      if (r) return { status: r.status, headers: r.headers ?? {}, cookies: [], body: asBody(r.data) };
      throw err;
    }
  };

  return {
    kind: 'cloud-sdk',
    async info() {
      const d = await dest();
      return `${destinationName} -> ${d.url}  [Cloud SDK, ${d.proxyType ?? 'Internet'}]`;
    },
    get: (url, opts) => call('GET', url, opts),
    post: (url, body, opts) => call('POST', url, { ...opts, body, csrf: true }),
  };
}

function builtinClient(destinationName) {
  let destination;
  const dest = async () => (destination ??= await resolveDestination(destinationName));

  // stan CSRF wspoldzielony miedzy POST-ami
  let csrf = null;
  let cookie = '';

  const toUrl = async (url, params) => {
    const d = await dest();
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ''));
    return `${d.url}${url}${qs.toString() ? `?${qs}` : ''}`;
  };

  const call = async (method, url, { headers = {}, params, body } = {}) => {
    const d = await dest();
    return request(await toUrl(url, params), {
      method,
      headers: { ...d.headers, ...headers, ...(cookie ? { cookie } : {}) },
      body,
      proxy: d.proxy,
    });
  };

  return {
    kind: 'builtin',
    async info() {
      const d = await dest();
      return `${destinationName} -> ${d.url}  [builtin, ${d.source}${d.proxy ? `, proxy ${d.proxy}` : ''}]`;
    },
    get: (url, opts) => call('GET', url, opts),

    /** Pobiera token CSRF dla sciezki serwisu (OData V2 wymaga go do POST). */
    async fetchCsrf(servicePath, params) {
      const res = await call('GET', `${servicePath}/`, {
        params,
        headers: { accept: 'application/json', 'x-csrf-token': 'Fetch' },
      });
      ensureOk(res, 'Pobranie CSRF tokenu');
      csrf = res.headers['x-csrf-token'] ?? null;
      cookie = cookieHeader(res.cookies);
      return csrf;
    },

    post: (url, body, opts = {}) =>
      call('POST', url, {
        ...opts,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...opts.headers,
        },
      }),
  };
}

/** @returns {Promise<{kind:string, info():Promise<string>, get, post, fetchCsrf?}>} */
export async function createClient(destinationName) {
  const sdk = await tryLoadCloudSdk();
  return sdk ? cloudSdkClient(sdk, destinationName) : builtinClient(destinationName);
}
