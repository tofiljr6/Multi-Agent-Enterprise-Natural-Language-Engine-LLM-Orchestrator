// Minimalny klient HTTP na wbudowanych modulach Node.
// Obsluguje forward-proxy w formie absolute-URI (connectivity proxy BTP dla destination OnPremise).
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
        `Cel ${target.origin} jest po HTTPS, a destination wymaga proxy. ` +
        `Tunel CONNECT nie jest zaimplementowany - uzyj destination z URL http:// (typowe dla OnPremise/Cloud Connector).`
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
    // przez proxy wysylamy pelny URL w linii zadania (absolute-form)
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
    req.setTimeout(timeout, () => req.destroy(new Error(`Timeout ${timeout} ms dla ${method} ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Rzuca wyjatkiem, gdy status jest poza 2xx. */
export function ensureOk(res, what) {
  if (res.status < 200 || res.status >= 300) {
    const snippet = res.body.slice(0, 800);
    throw new Error(`${what} zwrocilo HTTP ${res.status}\n${snippet}`);
  }
  return res;
}

/** Sklada naglowek Cookie z set-cookie odpowiedzi. */
export function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

export const basicAuth = (user, password) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
