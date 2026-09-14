import cds from '@sap/cds';
import { askGenAiHub, GENAI_DESTINATION_NAME } from './lib/genAiClient.js';

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

        try {
            const { content, raw } = await askGenAiHub(query, { modelName: req.data.modelName });

            console.log(`[genai-test] destination=${GENAI_DESTINATION_NAME} model=${req.data.modelName ?? '(default)'}`);
            console.log(`[genai-test] response -> ${String(content).slice(0, 500)}`);

            sendJson(req, 200, { content, raw });
            return;

        } catch (err) {
            console.error('GENAI TEST ASK FAILED');
            console.error(err);
            req.error(500, err.message);
        }
    });

});
