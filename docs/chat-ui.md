# Chat UI (`app/chat`) - a Fiori freestyle front end for AgentService

A single-page SAPUI5 freestyle app that talks to `AgentService.ask`. It is
served as static content by CAP (`cds watch` -> `http://localhost:4004/chat/index.html`),
so there is no build step and no extra dependency in `package.json`.

```
app/chat/
  index.html                 UI5 bootstrap (CDN), ComponentSupport
  Component.js                UIComponent
  manifest.json              rootView + the "agent" data source (/odata/v4/agent/)
  view/Chat.view.xml         sap.f.ShellBar + scroll thread + composer
  controller/Chat.controller.js
  model/markdown.js          tiny Markdown -> safe HTML renderer
  css/style.css              built on the sap_horizon theme tokens (--sapXxx)
```

## What it does

- One text box at the bottom (Enter sends, Shift+Enter = newline), a scrolling
  transcript above it, a Fiori shell header, and a **New chat** button.
- Each turn does `POST /odata/v4/agent/ask { "query": "..." }` and renders the
  `answer` as Markdown.
- Under every answer there is a collapsed **"Thinking · N tool calls"**
  disclosure. Expand it to see:
  - **Tools available this run** - the full catalogue the agent was given
    (`toolsAvailable`), loaded live from `SA1_300`.
  - Every call the agent actually made (`toolCalls`), numbered, with the
    **arguments** it passed and the raw **result** that came back.
- Errors from the service (e.g. missing `OPENAI_API_KEY`, no `SA1_300`
  destination) are shown in place as a red assistant message.

The response shape it consumes is exactly what `AgentService.js` returns:
`{ answer, toolsAvailable, toolCalls: [{ tool, args, output }] }`.

## Theming

The stylesheet only uses SAP theme CSS variables, so light (`sap_horizon`)
and dark (`sap_horizon_dark`) both work. Switch theme for a quick check with
`?sap-ui-theme=sap_horizon_dark` on the URL.

## Running it

```bash
cds watch          # then open http://localhost:4004/chat/index.html
```

Needs the same configuration as the service itself (`OPENAI_API_KEY`, and a
`SA1_300` destination for the tool catalogue - see
[agent-service.md](agent-service.md)).

## Deploying on BTP

`index.html` loads UI5 from the public CDN (`https://ui5.sap.com`). For an
HTML5-application-repository deployment behind the standard approuter, either
keep the CDN bootstrap (CF apps have outbound internet) or replace the
`src` in `index.html` with the approuter-served `ui5` resource. Nothing else
in the app needs to change - `/odata/v4/agent/ask` is called relative to the
app's own origin.
