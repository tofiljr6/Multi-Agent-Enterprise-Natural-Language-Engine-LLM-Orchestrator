import cds from '@sap/cds';
import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { fetchToolCatalog } from './lib/toolCatalog.js';
import { toLangChainTools } from './lib/agentTools.js';

const SYSTEM_PROMPT =
    'Jestes asystentem SAP. Masz dostep do zestawu narzedzi, ktore w danej ' +
    'chwili sa zaladowane z repozytorium narzedzi w SAP - moga sie zmieniac ' +
    'z uruchomienia na uruchomienie. Uzywaj ich, gdy potrzebujesz konkretnych ' +
    'danych, zamiast zgadywac. Jesli zadne narzedzie nie pasuje do pytania, ' +
    'powiedz to wprost zamiast wymyslac odpowiedz.';

// Wysyla surowy JSON z jawnym Content-Type, zamiast pozwolic CAP-owi opakowac
// wynik w koperte OData ({"value": "...string..."}).
function sendJson(req, status, data) {
    req._.res.status(status);
    req._.res.set('Content-Type', 'application/json');
    req._.res.send(JSON.stringify(data, null, 2));
}

export default cds.service.impl(function () {

    this.on('ask', async (req) => {
        const query = req.data.query?.trim();
        if (!query) {
            req.error(400, 'Parametr "query" jest wymagany.');
            return;
        }

        if (!process.env.OPENAI_API_KEY) {
            req.error(500, 'Brak OPENAI_API_KEY w konfiguracji (.env / env vars).');
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

            // Argumenty wywolania siedza w tool_calls poprzedzajacej AIMessage,
            // dopasowane po id do ToolMessage.tool_call_id - trzeba je sparowac,
            // zeby wiedziec nie tylko co odpowiedzialo narzedzie, ale i z czym
            // zostalo wywolane.
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
