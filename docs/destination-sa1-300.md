# Polaczenie z SA1_300

Skrypty nie wolaja SAP bezposrednio - zawsze ida przez **destination `SA1_300`**
na BTP. Warstwa transportu (`scripts/lib/transport.mjs`) wybiera implementacje
automatycznie.

## 1. SAP Cloud SDK (preferowane)

Uzywane, gdy w projekcie sa zainstalowane `@sap-cloud-sdk/connectivity`
i `@sap-cloud-sdk/http-client`. To ten sam wzorzec co w `business-partner-ai`
(`srv/lib/bpClient.js`):

```js
const destination = await getDestination({ destinationName: 'SA1_300' });
const response = await executeHttpRequest(destination, {
  method: 'GET',
  url: '/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata',
  params: { 'sap-client': '300' }
});
```

Cloud SDK zalatwia za nas: token XSUAA, connectivity proxy dla destination
`OnPremise` (Cloud Connector), principal propagation, oraz token CSRF
(`{ fetchCsrfToken: true }` przy POST).

Instalacja (osobno, gdy bedziesz gotowy):

```bash
npm i @sap-cloud-sdk/connectivity @sap-cloud-sdk/http-client
```

## 2. Fallback wbudowany (zero zaleznosci)

Gdy Cloud SDK nie jest zainstalowany, dziala wlasna implementacja na `node:http`:

- czyta `VCAP_SERVICES` -> binding `destination`,
- pobiera token client-credentials z XSUAA,
- pyta `GET {uri}/destination-configuration/v1/destinations/SA1_300`,
- dla `ProxyType=OnPremise` dokłada connectivity proxy (absolute-URI) +
  `Proxy-Authorization` + `SAP-Connectivity-SCC-Location_Id`,
- token CSRF pobiera recznie (`x-csrf-token: Fetch` + ciasteczka).

Ograniczenie: przez proxy obsluguje cele `http://` (typowe dla Cloud Connectora).
Cel `https://` przez proxy wymagalby tunelu CONNECT - skrypt zglosi to jasnym bledem.

Wymuszenie implementacji: `TRANSPORT=cloud-sdk` albo `TRANSPORT=builtin`.

## Konfiguracja

### W BTP (Cloud Foundry)

Nic nie trzeba ustawiac. Aplikacja musi miec zbindowane uslugi:

```yaml
# mta.yaml
requires:
  - name: <app>-destination-service
  - name: <app>-connectivity      # tylko dla destination OnPremise
  - name: <app>-xsuaa
```

`VCAP_SERVICES` czytaja oba transporty.

### Lokalnie, wariant 1 - zmienna `destinations`

Format Cloud SDK, dzialajacy takze w fallbacku. Jedna linia w `.env`:

```
destinations=[{"name":"SA1_300","url":"https://host:44300","username":"USER","password":"PASS"}]
```

### Lokalnie, wariant 2 - `default-env.json`

Plik z pelnym `VCAP_SERVICES` + `VCAP_APPLICATION` (symulacja CF). Wtedy Cloud SDK
robi realny lookup uslugi destination. Plik jest w `.gitignore`.

### Lokalnie, wariant 3 - bezposredni URL (tylko fallback)

```
SA1_URL=https://host:44300
SA1_USER=USER
SA1_PASSWORD=PASS
```

## Kolejnosc rozwiazywania (fallback)

1. `destinations` (JSON, format Cloud SDK)
2. `SA1_URL` / `SA1_USER` / `SA1_PASSWORD`
3. `VCAP_SERVICES` -> Destination Service

Jesli zaden nie zadziala, skrypt konczy sie komunikatem mowiacym, czego brakuje.

## Diagnostyka

| Objaw | Co sprawdzic |
|---|---|
| `Brak bindingu "destination"` | uruchamiasz lokalnie bez `.env` albo appka nie ma zbindowanej uslugi |
| `HTTP 401` | zle haslo w destination, wygasle konto techniczne, zly mandant |
| `HTTP 403` przy POST | token CSRF (patrz [sa1-tool-repository-api.md](sa1-tool-repository-api.md)) |
| `HTTP 404` na `$metadata` | serwis nieaktywowany w `/IWFND/MAINT_SERVICE` albo zla `SOURCE_SERVICE_PATH` |
| timeout na OnPremise | Cloud Connector nie wystawia hosta / zly Location ID |
| `ECONNREFUSED` lokalnie | brak VPN do systemu SA1 |
