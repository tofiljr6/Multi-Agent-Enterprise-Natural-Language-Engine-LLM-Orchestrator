import cds from '@sap/cds';
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

// Same pattern as in the business-partner-ai project (srv/lib/bpClient.js /
// BusinessPartnerAIService.js): destination + endpoint hardcoded in the
// code, zero configuration in .env.
const DESTINATION_NAME = 'SA1_300';
const TOOL_SET_BASE_URL = '/sap/opu/odata/sap/ZXXXX_KPI_SRV/ToolSet';
const TOOL_SET_URL = `${TOOL_SET_BASE_URL}?$expand=to_Parameters`;

// Sends a plain JSON response with an explicit Content-Type, instead of
// letting CAP wrap the result in an OData envelope ({"value": "...string..."}).
// This way the client (browser, Postman) gets clean, formatted JSON.
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

    // Deep insert: creates a Tool together with its to_Parameters in a
    // single POST. req.data is already the parsed action body - fields
    // 1:1 as in docs/sa1-tool-repository-api.md (ToolName, ToolDesc, ...,
    // to_Parameters). OData V2 on the SAP side requires a CSRF token for
    // modifications - Cloud SDK fetches it itself (fetchCsrfToken: true),
    // exactly like the old scripts/post-tools.mjs used to.
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

            // Error from the SAP backend (e.g. 400/403/500) - Cloud SDK
            // throws it as err.response, so we forward the real status and
            // body instead of a generic 500.
            const r = err?.response ?? err?.cause?.response;
            if (r) {
                sendJson(req, r.status, r.data);
                return;
            }

            req.error(500, err.message);
        }
    });

});
