import cds from '@sap/cds';
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

// Ten sam wzorzec co w projekcie business-partner-ai (srv/lib/bpClient.js /
// BusinessPartnerAIService.js): destination + endpoint na sztywno w kodzie,
// zero konfiguracji w .env.
const DESTINATION_NAME = 'SA1_300';
const TOOL_SET_URL = '/sap/opu/odata/sap/ZXXXX_KPI_SRV/ToolSet?$expand=to_Parameters';

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

            // Zwracamy surowy JSON z jawnym Content-Type, zamiast pozwolic
            // CAP-owi opakowac go w koperte OData ({"value": "...string..."}).
            // Dzieki temu klient (przegladarka, Postman) dostaje czysty,
            // sformatowany JSON zamiast zescapowanego stringa w stringu.
            req._.res.set('Content-Type', 'application/json');
            req._.res.send(JSON.stringify(response.data, null, 2));
            return;

        } catch (err) {
            console.error('CALL FAILED');
            console.error(err);

            req.error(500, err.message);
        }
    });

});
