// Performs the actual OData call against SA1_300 for one Tool from the
// repository, following the semantics described in
// docs/sa1-tool-repository-api.md ("Field semantics when invoking a
// tool"): KEY -> key segment (+ NavigationProp), FILTER -> $filter (from
// FilterTemplate, or assembled by hand).
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

    // Deliberately NOT applying tool.SelectFields here: that field is
    // picked heuristically when the tool is generated (toolgen.mjs) and
    // can miss exactly the columns the user is asking about (e.g.
    // StreetName/CityName for an address). $select in OData truncates the
    // response server-side - a badly picked SelectFields is a silent loss
    // of data that the model has no way to recover from afterwards. A full
    // record is cheaper than a wrong answer.
    const params = { $format: 'json' };

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
 * @param {object} tool an entry from fetchToolCatalog()
 * @param {Record<string, string>} args arguments from the model, keyed by ParamName
 * @returns {Promise<unknown>} response.data from the OData call
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
