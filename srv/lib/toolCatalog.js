// Fetches the current tool catalog from the repository on SA1_300 - the
// same endpoint as KpiToolService.getTools (GET
// ToolSet?$expand=to_Parameters) - and normalizes the OData V2 response
// ({d:{results:[...]}}) into a plain JS array, so AgentService can build
// LangChain tools from it.
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

export const DESTINATION_NAME = 'SA1_300';
const TOOL_SET_URL = '/sap/opu/odata/sap/ZXXXX_KPI_SRV/ToolSet?$expand=to_Parameters';

/** @returns {Promise<Array<object>>} active tools (Active = 'X'), to_Parameters as an array */
export async function fetchToolCatalog() {
    const destination = await getDestination({ destinationName: DESTINATION_NAME });

    const response = await executeHttpRequest(destination, {
        method: 'GET',
        url: TOOL_SET_URL
    });

    const raw = response.data;
    const tools = raw?.d?.results ?? raw?.value ?? (Array.isArray(raw) ? raw : []);

    return tools
        .filter((t) => t.Active === 'X' || t.Active === undefined)
        .map((t) => ({
            ...t,
            to_Parameters: t.to_Parameters?.results ?? t.to_Parameters ?? []
        }));
}
