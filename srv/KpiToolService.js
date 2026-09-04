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

            return JSON.stringify(response.data);

        } catch (err) {
            console.error('CALL FAILED');
            console.error(err);

            req.error(500, err.message);
        }
    });

});
