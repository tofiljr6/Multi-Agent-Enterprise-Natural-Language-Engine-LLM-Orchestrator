import cds from '@sap/cds';
import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { fetchToolCatalog } from './lib/toolCatalog.js';
import { toLangChainTools } from './lib/agentTools.js';

const SYSTEM_PROMPT =
    'You are a SAP assistant. You have access to a set of tools that are ' +
    'currently loaded from a tool repository in SAP - they may change from ' +
    'one run to the next. Use them whenever you need concrete data instead ' +
    'of guessing. If no tool fits the question, say so plainly instead of ' +
    'making up an answer.';

// Sends a plain JSON response with an explicit Content-Type, instead of
// letting CAP wrap the result in an OData envelope ({"value": "...string..."}).
function sendJson(req, status, data) {
    req._.res.status(status);
    req._.res.set('Content-Type', 'application/json');
    req._.res.send(JSON.stringify(data, null, 2));
}

export default cds.service.impl(function () {

    this.on('ask', async (req) => {
        const query = req.data.query?.trim();
        if (!query) {
            req.error(400, 'The "query" parameter is required.');
            return;
        }

        if (!process.env.OPENAI_API_KEY) {
            req.error(500, 'Missing OPENAI_API_KEY in configuration (.env / env vars).');
            return;
        }

        try {
            const catalog = await fetchToolCatalog();
            const tools = toLangChainTools(catalog);

            const model = new ChatOpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
                temperature: 0
            });

            const agent = createAgent({ model, tools, systemPrompt: SYSTEM_PROMPT });

            const result = await agent.invoke({
                messages: [{ role: 'user', content: query }]
            });

            const answer = result.messages.at(-1)?.content ?? '';

            // Call arguments live in the tool_calls of the preceding
            // AIMessage, matched by id to ToolMessage.tool_call_id - they
            // need to be paired up so we know not just what a tool
            // responded, but also what it was called with.
            const argsByCallId = new Map();
            for (const m of result.messages) {
                for (const tc of m.tool_calls ?? []) argsByCallId.set(tc.id, tc.args);
            }
            const toolCalls = result.messages
                .filter((m) => m.constructor?.name === 'ToolMessage')
                .map((m) => ({ tool: m.name, args: argsByCallId.get(m.tool_call_id) ?? {}, output: m.content }));

            for (const c of toolCalls) {
                console.log(`[agent] tool ${c.tool}(${JSON.stringify(c.args)}) -> ${String(c.output).slice(0, 500)}`);
            }

            sendJson(req, 200, {
                answer,
                toolsAvailable: tools.map((t) => t.name),
                toolCalls
            });
            return;

        } catch (err) {
            console.error('AGENT ASK FAILED');
            console.error(err);
            req.error(500, err.message);
        }
    });

});
