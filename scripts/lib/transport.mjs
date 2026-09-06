// Transport layer to the SAP system through a destination.
//
// Two implementations, chosen automatically:
//   1) SAP Cloud SDK - when @sap-cloud-sdk/connectivity + /http-client are installed.
//      Same pattern as in the business-partner-ai project (srv/lib/bpClient.js):
//         const destination = await getDestination({ destinationName: 'SA1_300' })
//         await executeHttpRequest(destination, { method, url, params })
//      Cloud SDK handles XSUAA, the connectivity proxy (OnPremise), principal
//      propagation, and the local `destinations=[{...}]` variable, all by itself.
//   2) Built-in fallback - zero dependencies (node:http + its own destination lookup).
//      Works without npm install; supports VCAP_SERVICES, `destinations`, and SA1_URL.
//
// Force a specific implementation: TRANSPORT=cloud-sdk | builtin
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
      throw new Error('TRANSPORT=cloud-sdk, but @sap-cloud-sdk/connectivity and @sap-cloud-sdk/http-client are missing.');
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

  // CSRF state shared across POSTs
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

    /** Fetches a CSRF token for the service path (OData V2 requires it for POST). */
    async fetchCsrf(servicePath, params) {
      const res = await call('GET', `${servicePath}/`, {
        params,
        headers: { accept: 'application/json', 'x-csrf-token': 'Fetch' },
      });
      ensureOk(res, 'Fetching the CSRF token');
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
