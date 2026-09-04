import cds from '@sap/cds';
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

// Ten sam wzorzec co w projekcie business-partner-ai (srv/lib/bpClient.js /
// BusinessPartnerAIService.js): destination + endpoint na sztywno w kodzie,
// zero konfiguracji w .env.
const DESTINATION_NAME = 'SA1_300';
const TOOL_SET_BASE_URL = '/sap/opu/odata/sap/ZXXXX_KPI_SRV/ToolSet';
const TOOL_SET_URL = `${TOOL_SET_BASE_URL}?$expand=to_Parameters`;

// Wysyla surowy JSON z jawnym Content-Type, zamiast pozwolic CAP-owi opakowac
// wynik w koperte OData ({"value": "...string..."}). Dzieki temu klient
// (przegladarka, Postman) dostaje czysty, sformatowany JSON.
function sendJson(req, status, data) {
    req._.res.status(status);
    req._.res.set('Content-Type', 'application/json');
    req._.res.send(JSON.stringify(data, null, 2));
}

export default cds.service.impl(function () {

    this.on('getTools', async (req) => {
        try {
            const destination = await getDestination({ destinationName: DESTINATION_NAME });

            console.log('DESTINATION:', {
                name: destination?.name,
                url: destination?.url,
                proxyType: destination?.proxyType,
                authentication: destination?.authentication
            });

            const response = await executeHttpRequest(destination, {
                method: 'GET',
                url: TOOL_SET_URL
            });

            sendJson(req, 200, response.data);
            return;

        } catch (err) {
            console.error('CALL FAILED');
            console.error(err);

            req.error(500, err.message);
        }
    });

    // Deep insert: tworzy Tool razem z jego to_Parameters jednym POST-em.
    // req.data to juz sparsowane body akcji - pola 1:1 jak w
    // docs/sa1-tool-repository-api.md (ToolName, ToolDesc, ..., to_Parameters).
    // OData V2 po stronie SAP wymaga tokenu CSRF do modyfikacji - Cloud SDK
    // pobiera go sam (fetchCsrfToken: true), dokladnie tak jak robil to stary
    // scripts/post-tools.mjs.
    this.on('createTool', async (req) => {
        const payload = req.data;

        try {
            const destination = await getDestination({ destinationName: DESTINATION_NAME });

            const response = await executeHttpRequest(
                destination,
                {
                    method: 'POST',
                    url: TOOL_SET_BASE_URL,
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    data: payload
                },
                { fetchCsrfToken: true }
            );

            sendJson(req, response.status, response.data);
            return;

        } catch (err) {
            console.error('CREATE TOOL CALL FAILED');
            console.error(err);

            // Blad z backendu SAP (np. 400/403/500) - Cloud SDK go rzuca jako
            // err.response, wiec przekazujemy prawdziwy status i tresc dalej.
            const r = err?.response ?? err?.cause?.response;
            if (r) {
                sendJson(req, r.status, r.data);
                return;
            }

            req.error(500, err.message);
        }
    });

});
