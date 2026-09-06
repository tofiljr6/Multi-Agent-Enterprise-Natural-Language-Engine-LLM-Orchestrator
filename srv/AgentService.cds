service AgentService {

    /**
     * Odpowiada na pytanie uzytkownika przy pomocy LangChain + LLM.
     * Przed odpowiedzia agent pobiera aktualny katalog narzedzi z
     * repozytorium na SA1_300 (ten sam mechanizm co KpiToolService.getTools)
     * i binduje je do modelu jako tool-calling, wiec model moze w trakcie
     * odpowiedzi wywolac realne dane z SAP.
     */
    action ask(query: String) returns LargeString;

}
