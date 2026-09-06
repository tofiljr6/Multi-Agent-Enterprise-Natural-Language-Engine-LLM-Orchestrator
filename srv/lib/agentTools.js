// Turns the tool catalog from fetchToolCatalog() into LangChain tools
// (tool() from the "langchain" package), ready to be bound to the agent.
import { z } from 'zod';
import { tool } from 'langchain';
import { callSapTool } from './toolExecutor.js';

const ZOD_BY_PARAM_TYPE = {
    STRING: () => z.string(),
    NUMBER: () => z.coerce.number(),
    BOOLEAN: () => z.coerce.boolean(),
    DATE: () => z.string(),
    TIME: () => z.string()
};

function buildSchema(toolDef) {
    const shape = {};
    for (const p of toolDef.to_Parameters) {
        const base = (ZOD_BY_PARAM_TYPE[p.ParamType] ?? ZOD_BY_PARAM_TYPE.STRING)();
        const described = p.ParamDesc ? base.describe(p.ParamDesc) : base;
        shape[p.ParamName] = p.IsRequired === 'X' ? described : described.optional();
    }
    // Zod V4 requires at least one field in a tool's action schema - tools
    // with no parameters get an unused technical field.
    if (Object.keys(shape).length === 0) shape._ = z.string().optional();
    return z.object(shape);
}

/** @param {Array<object>} catalog result of fetchToolCatalog() */
export function toLangChainTools(catalog) {
    return catalog.map((toolDef) =>
        tool(
            async (args) => {
                try {
                    const data = await callSapTool(toolDef, args);
                    return JSON.stringify(data);
                } catch (err) {
                    const detail = err?.response?.data ?? err?.cause?.response?.data ?? err.message;
                    return `ERROR: calling tool ${toolDef.ToolName} failed: ${JSON.stringify(detail)}`;
                }
            },
            {
                name: toolDef.ToolName,
                description: toolDef.ToolDesc || `Call ${toolDef.EntitySet} in ${toolDef.ServiceName}`,
                schema: buildSchema(toolDef)
            }
        )
    );
}
