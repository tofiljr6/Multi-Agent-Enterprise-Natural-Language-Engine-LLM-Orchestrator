// Pobiera aktualny katalog narzedzi z repozytorium na SA1_300 - ten sam
// endpoint co KpiToolService.getTools (GET ToolSet?$expand=to_Parameters) -
// i normalizuje odpowiedz OData V2 ({d:{results:[...]}}) do zwyklej tablicy
// JS, zeby AgentService moglo z niej zbudowac narzedzia LangChain.
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

export const DESTINATION_NAME = 'SA1_300';
const TOOL_SET_URL = '/sap/opu/odata/sap/ZXXXX_KPI_SRV/ToolSet?$expand=to_Parameters';

/** @returns {Promise<Array<object>>} aktywne narzedzia (Active = 'X'), to_Parameters jako tablica */
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
