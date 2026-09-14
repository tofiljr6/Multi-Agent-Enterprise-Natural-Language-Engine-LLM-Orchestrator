service GenAiTestService {

    /**
     * Test action: sends `query` as a prompt to SAP AI Core / Generative AI
     * Hub (Orchestration Service, POST /v2/completion) through the
     * "genai-dest" destination, and returns the raw JSON response
     * ({ content, raw }) as a string. Purely for trying out the new
     * destination - see docs/genai-test-service.md.
     */
    action ask(query: String, modelName: String) returns LargeString;

}
