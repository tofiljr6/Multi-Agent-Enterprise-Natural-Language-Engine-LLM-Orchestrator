service KpiToolService {

    /**
     * Pobiera ToolSet (z rozwinieciem to_Parameters) z serwisu ZXXXX_KPI_SRV
     * przez destination SA1_300. Endpoint jest wpisany na sztywno w
     * KpiToolService.js - nie ma zadnej konfiguracji w .env.
     */
    function getTools() returns LargeString;

}
