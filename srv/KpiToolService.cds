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
     * Pobiera ToolSet (z rozwinieciem to_Parameters) z serwisu ZXXXX_KPI_SRV
     * przez destination SA1_300. Endpoint jest wpisany na sztywno w
     * KpiToolService.js - nie ma zadnej konfiguracji w .env.
     */
    function getTools() returns LargeString;

    /**
     * Tworzy Tool razem z jego to_Parameters jednym deep insertem
     * (POST /ToolSet) w serwisie ZXXXX_KPI_SRV przez destination SA1_300.
     * Parametry akcji odpowiadaja 1:1 polom z docs/sa1-tool-repository-api.md
     * - body POST-a to zwykly plaski JSON, bez zadnego wrappera:
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
