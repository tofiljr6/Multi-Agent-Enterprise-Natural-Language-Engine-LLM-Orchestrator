service AgentService {

    /**
     * Answers a user's question using LangChain + an LLM. Before
     * answering, the agent fetches the current tool catalog from the
     * repository on SA1_300 (the same mechanism as
     * KpiToolService.getTools) and binds it to the model as tool-calling,
     * so the model can pull real data from SAP while answering.
     */
    action ask(query: String) returns LargeString;

}
