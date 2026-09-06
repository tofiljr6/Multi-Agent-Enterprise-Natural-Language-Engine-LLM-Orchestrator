type ToolParameterInput {
    ParamName     : String;
    ParamDesc     : String;
    ParamType     : String;
    ODataProperty : String;
    ParamUsage    : String;
    IsRequired    : String;
    Pos           : String;
    DefaultValue  : String;
}

service KpiToolService {

    /**
     * Fetches the ToolSet (with to_Parameters expanded) from the
     * ZXXXX_KPI_SRV service through the SA1_300 destination. The endpoint
     * is hardcoded in KpiToolService.js - there is no configuration in .env.
     */
    function getTools() returns LargeString;

    /**
     * Creates a Tool together with its to_Parameters in a single deep
     * insert (POST /ToolSet) against the ZXXXX_KPI_SRV service through the
     * SA1_300 destination. The action's parameters map 1:1 to the fields
     * documented in docs/sa1-tool-repository-api.md - the POST body is a
     * plain flat JSON object, with no wrapper:
     *
     *   { "ToolName": "...", "ToolDesc": "...", ..., "to_Parameters": [...] }
     */
    action createTool(
        ToolName       : String,
        ToolDesc       : String,
        ServiceName    : String,
        EntitySet      : String,
        HTTPMethod     : String,
        NavigationProp : String,
        SelectFields   : String,
        FilterTemplate : String,
        Active         : String,
        to_Parameters  : array of ToolParameterInput
    ) returns LargeString;

}
