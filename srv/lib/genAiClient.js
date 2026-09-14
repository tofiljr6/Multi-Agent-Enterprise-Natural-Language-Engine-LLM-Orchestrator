// Calls the SAP AI Core / Generative AI Hub Orchestration Service through
// the "genai-dest" destination (BTP Destination Service, same connectivity
// mechanism as toolCatalog.js / toolExecutor.js for SA1_300).
//
// Orchestration Service completion endpoint: POST /v2/completion
// Docs: https://help.sap.com/docs/sap-ai-core (Orchestration -> Completion)
import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
import { getDestination } from '@sap-cloud-sdk/connectivity';

export const GENAI_DESTINATION_NAME = process.env.GENAI_DESTINATION_NAME ?? 'genai-dest';
const COMPLETION_PATH = '/v2/completion';

/**
 * @param {string} prompt user prompt
 * @param {{modelName?:string, resourceGroup?:string, temperature?:number, maxTokens?:number}} [opts]
 * @returns {Promise<{content:string, raw:unknown}>}
 */
export async function askGenAiHub(prompt, opts = {}) {
    const modelName = opts.modelName ?? process.env.GENAI_MODEL_NAME ?? 'gpt-4o-mini';
    const resourceGroup = opts.resourceGroup ?? process.env.GENAI_RESOURCE_GROUP ?? 'default';

    const body = {
        orchestration_config: {
            module_configurations: {
                llm_module_config: {
                    model_name: modelName,
                    model_params: {
                        temperature: opts.temperature ?? 0.2,
                        max_tokens: opts.maxTokens ?? 500
                    }
                },
                templating_module_config: {
                    template: [
                        { role: 'user', content: '{{?input}}' }
                    ]
                }
            }
        },
        input_params: { input: prompt }
    };

    const destination = await getDestination({ destinationName: GENAI_DESTINATION_NAME });

    const response = await executeHttpRequest(destination, {
        method: 'POST',
        url: COMPLETION_PATH,
        headers: { 'AI-Resource-Group': resourceGroup },
        data: body
    });

    const raw = response.data;
    const content = extractContent(raw);

    return { content, raw };
}

// The Orchestration Service normally returns
// { orchestration_result: { choices: [{ message: { content } }] } }, but the
// exact shape has drifted across API versions, so we fall back through a
// few reasonable spots before giving up.
function extractContent(raw) {
    return (
        raw?.orchestration_result?.choices?.[0]?.message?.content ??
        raw?.choices?.[0]?.message?.content ??
        raw?.module_results?.llm?.choices?.[0]?.message?.content ??
        ''
    );
}
