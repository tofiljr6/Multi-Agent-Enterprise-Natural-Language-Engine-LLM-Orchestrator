# Connecting to SA1_300

The scripts never call SAP directly - they always go through the
**`SA1_300` destination** on BTP. The transport layer
(`scripts/lib/transport.mjs`) picks an implementation automatically.

## 1. SAP Cloud SDK (preferred)

Used when `@sap-cloud-sdk/connectivity` and `@sap-cloud-sdk/http-client` are
installed in the project. Same pattern as in `business-partner-ai`
(`srv/lib/bpClient.js`):

```js
const destination = await getDestination({ destinationName: 'SA1_300' });
const response = await executeHttpRequest(destination, {
  method: 'GET',
  url: '/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata',
  params: { 'sap-client': '300' }
});
```

Cloud SDK handles all of this for us: the XSUAA token, the connectivity
proxy for `OnPremise` destinations (Cloud Connector), principal propagation,
and the CSRF token (`{ fetchCsrfToken: true }` on POST).

Install it (separately, whenever you're ready):

```bash
npm i @sap-cloud-sdk/connectivity @sap-cloud-sdk/http-client
```

## 2. Built-in fallback (zero dependencies)

When Cloud SDK isn't installed, a homegrown implementation on `node:http`
kicks in:

- reads `VCAP_SERVICES` -> the `destination` binding,
- fetches a client-credentials token from XSUAA,
- calls `GET {uri}/destination-configuration/v1/destinations/SA1_300`,
- for `ProxyType=OnPremise` adds the connectivity proxy (absolute-URI) +
  `Proxy-Authorization` + `SAP-Connectivity-SCC-Location_Id`,
- fetches the CSRF token by hand (`x-csrf-token: Fetch` + cookies).

Limitation: through the proxy it only supports `http://` targets (typical
for Cloud Connector). An `https://` target through the proxy would need a
CONNECT tunnel - the script reports this with a clear error.

Force a specific implementation: `TRANSPORT=cloud-sdk` or `TRANSPORT=builtin`.

## Configuration

### On BTP (Cloud Foundry)

Nothing to configure. The app just needs the services bound:

```yaml
# mta.yaml
requires:
  - name: <app>-destination-service
  - name: <app>-connectivity      # only for OnPremise destinations
  - name: <app>-xsuaa
```

`VCAP_SERVICES` is read by both transports.

### Locally, option 1 - the `destinations` variable

Cloud SDK's format, also supported by the fallback. One line in `.env`:

```
destinations=[{"name":"SA1_300","url":"https://host:44300","username":"USER","password":"PASS"}]
```

### Locally, option 2 - `default-env.json`

A file with a full `VCAP_SERVICES` + `VCAP_APPLICATION` (simulating CF).
Cloud SDK then does a real destination-service lookup. The file is in
`.gitignore`.

### Locally, option 3 - direct URL (fallback only)

```
SA1_URL=https://host:44300
SA1_USER=USER
SA1_PASSWORD=PASS
```

## Resolution order (fallback)

1. `destinations` (JSON, Cloud SDK format)
2. `SA1_URL` / `SA1_USER` / `SA1_PASSWORD`
3. `VCAP_SERVICES` -> Destination Service

If none of these work, the script exits with a message saying what's missing.

## Troubleshooting

| Symptom | What to check |
|---|---|
| `Missing "destination" binding` | you're running locally without `.env`, or the app has no service bound |
| `HTTP 401` | wrong password in the destination, expired technical user, wrong client |
| `HTTP 403` on POST | CSRF token (see [sa1-tool-repository-api.md](sa1-tool-repository-api.md)) |
| `HTTP 404` on `$metadata` | service not activated in `/IWFND/MAINT_SERVICE`, or wrong `SOURCE_SERVICE_PATH` |
| timeout on OnPremise | Cloud Connector isn't exposing the host / wrong Location ID |
| `ECONNREFUSED` locally | no VPN to the SA1 system |
