// Wykonuje realne wywolanie OData na SA1_300 dla jednego Tool z repozytorium,
// wg semantyki opisanej w docs/sa1-tool-repository-api.md ("Semantyka pol
// przy wywolaniu narzedzia"): KEY -> segment klucza (+ NavigationProp),
// FILTER -> $filter (z FilterTemplate albo sklejony recznie).
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';
import { DESTINATION_NAME } from './toolCatalog.js';

const needsQuotes = (paramType) => paramType === 'STRING' || paramType === 'DATE' || !paramType;

function buildRequest(tool, args) {
    const keyParams = [...tool.to_Parameters]
        .filter((p) => p.ParamUsage === 'KEY')
        .sort((a, b) => String(a.Pos).localeCompare(String(b.Pos)));
    const filterParams = tool.to_Parameters.filter((p) => p.ParamUsage === 'FILTER');

    let url = `/sap/opu/odata/sap/${tool.ServiceName}/${tool.EntitySet}`;

    if (keyParams.length === 1) {
        url += `('${args[keyParams[0].ParamName] ?? ''}')`;
    } else if (keyParams.length > 1) {
        const keyExpr = keyParams
            .map((p) => `${p.ODataProperty}='${args[p.ParamName] ?? ''}'`)
            .join(',');
        url += `(${keyExpr})`;
    }

    if (tool.NavigationProp) url += `/${tool.NavigationProp}`;

    const params = { $format: 'json' };
    if (tool.SelectFields) params.$select = tool.SelectFields;

    if (filterParams.length > 0) {
        let filter;
        if (tool.FilterTemplate) {
            filter = tool.FilterTemplate.replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '');
        } else {
            filter = filterParams
                .filter((p) => args[p.ParamName] !== undefined && args[p.ParamName] !== '')
                .map((p) => `${p.ODataProperty} eq ${needsQuotes(p.ParamType) ? `'${args[p.ParamName]}'` : args[p.ParamName]}`)
                .join(' and ');
        }
        if (filter) params.$filter = filter;
    }

    return { url, params };
}

/**
 * @param {object} tool wpis z fetchToolCatalog()
 * @param {Record<string, string>} args argumenty od modelu, klucze = ParamName
 * @returns {Promise<unknown>} response.data z wywolania OData
 */
export async function callSapTool(tool, args) {
    const destination = await getDestination({ destinationName: DESTINATION_NAME });
    const { url, params } = buildRequest(tool, args);

    const response = await executeHttpRequest(destination, {
        method: tool.HTTPMethod || 'GET',
        url,
        params
    });

    return response.data;
}
