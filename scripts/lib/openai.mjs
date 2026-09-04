// Generuje ToolDesc / ParamDesc przez OpenAI zamiast szablonu w toolgen.mjs.
// Jeden request na narzedzie (Chat Completions, response_format: json_object),
// zeby model widzial cale narzedzie (nazwe, encje, wszystkie parametry) naraz
// i opisy byly spojne ze soba.

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'Jestes ekspertem SAP OData, ktory pisze krotkie, precyzyjne opisy narzedzi ' +
  '(tools) dla agentow AI. Opisy sa po angielsku, rzeczowe, bez marketingowego ' +
  'jezyka, max 1-2 zdania na ToolDesc i pol zdania na ParamDesc. Odpowiadaj ' +
  'WYLACZNIE poprawnym JSON-em w formacie ' +
  '{"ToolDesc": "...", "params": {"<ParamName>": "..."}}, bez dodatkowego tekstu.';

function buildUserPrompt(tool) {
  const paramLines = tool.to_Parameters
    .map((p) => `  - ${p.ParamName} (SAP: ${p.ODataProperty}, usage: ${p.ParamUsage}, type: ${p.ParamType})`)
    .join('\n');

  return [
    `ToolName: ${tool.ToolName}`,
    `SAP OData service: ${tool.ServiceName}`,
    `EntitySet: ${tool.EntitySet}${tool.NavigationProp ? ` (navigation: ${tool.NavigationProp})` : ''}`,
    `HTTP method: ${tool.HTTPMethod}`,
    tool.SelectFields ? `Selected fields: ${tool.SelectFields}` : '',
    'Parameters:',
    paramLines || '  (brak)',
    '',
    'Napisz ToolDesc dla calego narzedzia oraz ParamDesc dla kazdego parametru z listy powyzej.',
  ].filter(Boolean).join('\n');
}

/**
 * @param {object} tool payload wygenerowany przez toolgen.mjs (z szablonowymi opisami)
 * @param {{apiKey:string, model:string}} cfg
 * @returns {Promise<{ToolDesc:string, params:Record<string,string>}>}
 */
export async function describeTool(tool, cfg) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(tool) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI zwrocilo HTTP ${res.status} dla ${tool.ToolName}\n${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI nie zwrocilo tresci dla ${tool.ToolName}`);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI zwrocilo niepoprawny JSON dla ${tool.ToolName}: ${err.message}\n${content.slice(0, 500)}`);
  }

  return { ToolDesc: parsed.ToolDesc ?? '', params: parsed.params ?? {} };
}

/**
 * Nadpisuje ToolDesc/ParamDesc narzedzi wynikami z OpenAI, in-place na kopii.
 * Idzie sekwencyjnie (nie rownolegle) - prosciej o czytelny log postepu i nie
 * obija sie o rate limity przy wiekszej liczbie narzedzi.
 */
export async function enrichWithOpenAI(tools, cfg, limits) {
  const cut = (s, max) => (s.length <= max ? s : s.slice(0, max));
  const out = [];

  for (const [i, tool] of tools.entries()) {
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${tools.length}] ${tool.ToolName} ... `);
    try {
      const { ToolDesc, params } = await describeTool(tool, cfg);
      out.push({
        ...tool,
        ToolDesc: cut(ToolDesc || tool.ToolDesc, limits.toolDesc),
        to_Parameters: tool.to_Parameters.map((p) => ({
          ...p,
          ParamDesc: cut(params[p.ParamName] || p.ParamDesc, limits.paramDesc),
        })),
      });
      console.log('OK');
    } catch (err) {
      console.log(`POMINIETO (${err.message})`);
      out.push(tool); // zostaw szablonowy opis z toolgen.mjs
    }
  }

  return out;
}
