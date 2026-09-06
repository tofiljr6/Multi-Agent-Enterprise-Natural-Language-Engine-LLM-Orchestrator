// Minimal HTTP client built on Node's own modules.
// Supports a forward-proxy in absolute-URI form (BTP connectivity proxy for OnPremise destinations).
import http from 'node:http';
import https from 'node:https';

/**
 * @param {string} url
 * @param {{method?:string, headers?:Record<string,string>, body?:string, proxy?:string, timeout?:number}} opts
 * @returns {Promise<{status:number, headers:Record<string,any>, cookies:string[], body:string}>}
 */
export function request(url, opts = {}) {
  const { method = 'GET', headers = {}, body, proxy, timeout = 120000 } = opts;
  const target = new URL(url);

  let conn = target;
  if (proxy) {
    if (target.protocol === 'https:') {
      throw new Error(
        `Target ${target.origin} is over HTTPS, and the destination requires a proxy. ` +
        `A CONNECT tunnel is not implemented - use a destination with an http:// URL (typical for OnPremise/Cloud Connector).`
      );
    }
    conn = new URL(proxy);
  }

  const lib = conn.protocol === 'https:' ? https : http;
  const requestOptions = {
    protocol: conn.protocol,
    hostname: conn.hostname,
    port: conn.port || (conn.protocol === 'https:' ? 443 : 80),
    method,
    // through the proxy we send the full URL on the request line (absolute-form)
    path: proxy ? target.toString() : `${target.pathname}${target.search}`,
    headers: { host: target.host, ...headers },
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          cookies: res.headers['set-cookie'] ?? [],
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.setTimeout(timeout, () => req.destroy(new Error(`Timeout of ${timeout} ms for ${method} ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Throws when the status is outside 2xx. */
export function ensureOk(res, what) {
  if (res.status < 200 || res.status >= 300) {
    const snippet = res.body.slice(0, 800);
    throw new Error(`${what} returned HTTP ${res.status}\n${snippet}`);
  }
  return res;
}

/** Builds a Cookie header from a response's set-cookie values. */
export function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

export const basicAuth = (user, password) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
