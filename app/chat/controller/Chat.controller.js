sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/ui/model/json/JSONModel',
  'sap/ui/core/HTML',
  'sap/ui/core/Icon',
  'sap/m/VBox',
  'sap/m/HBox',
  'sap/m/Text',
  'sap/m/Panel',
  'sap/m/Toolbar',
  'sap/m/ToolbarSpacer',
  'menelo/chat/model/markdown',
], function (
  Controller, JSONModel, HTML, Icon, VBox, HBox, Text, Panel, Toolbar, ToolbarSpacer, markdown
) {
  'use strict'

  // Same origin as the app: cds watch locally, the approuter on BTP.
  var SERVICE = '/odata/v4/agent'

  return Controller.extend('menelo.chat.controller.Chat', {

    onInit: function () {
      this._model = new JSONModel({
        messages: [],
        input: '',
        busy: false,
        busyText: 'Thinking…',
      })
      this.getView().setModel(this._model)

      this._renderMessages()

      this.byId('input').addEventDelegate({
        onkeydown: function (event) {
          var isEnter = event.key === 'Enter' || event.keyCode === 13 || event.which === 13
          if (!isEnter || event.shiftKey) return
          event.preventDefault()
          this.onSend()
        }.bind(this),
      })
    },

    /* ----------------------------------------------------------- backend -- */

    _csrfToken: null,

    /** POST { query } to AgentService.ask and return { answer, toolsAvailable, toolCalls }. */
    _ask: async function (query) {
      var options = {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
      }
      if (!this._csrfToken) {
        try {
          var probe = await fetch(SERVICE + '/', { headers: { 'X-CSRF-Token': 'Fetch' } })
          this._csrfToken = probe.headers.get('x-csrf-token')
        } catch (e) { /* local dev usually has CSRF off */ }
      }
      if (this._csrfToken) options.headers['X-CSRF-Token'] = this._csrfToken

      var response = await fetch(SERVICE + '/ask', options)
      var body = await response.text()
      var data
      try { data = body ? JSON.parse(body) : {} } catch (e) { data = { answer: body } }
      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || response.statusText || 'Request failed')
      }
      return data
    },

    /* -------------------------------------------------------------- chat -- */

    onLiveChange: function (event) {
      this._model.setProperty('/input', event.getParameter('value') || '')
    },

    onSend: function () {
      var text = (this._model.getProperty('/input') || '').trim()
      if (!text || this._model.getProperty('/busy')) return
      this._model.setProperty('/input', '')

      this._push({ role: 'user', text: text })
      this._model.setProperty('/busyText', 'Thinking…')
      this._model.setProperty('/busy', true)
      this._scrollToBottom()

      this._ask(text).then(function (data) {
        this._push({
          role: 'assistant',
          text: data.answer || '_(the agent returned an empty answer)_',
          toolsAvailable: data.toolsAvailable || [],
          toolCalls: data.toolCalls || [],
        })
      }.bind(this)).catch(function (err) {
        this._push({
          role: 'assistant',
          kind: 'error',
          text: 'Something went wrong.\n\n```\n' + String(err.message).split('\n')[0] + '\n```',
        })
      }.bind(this)).finally(function () {
        this._model.setProperty('/busy', false)
        this._scrollToBottom()
      }.bind(this))
    },

    onNewChat: function () {
      this._csrfToken = null
      this._model.setProperty('/messages', [])
      this._model.setProperty('/input', '')
      this._renderMessages()
    },

    _push: function (message) {
      var messages = this._model.getProperty('/messages').concat([message])
      this._model.setProperty('/messages', messages)
      this._renderMessages()
    },

    /* ---------------------------------------------------------- messages -- */

    _renderMessages: function () {
      var container = this.byId('messages')
      container.destroyItems()
      this._model.getProperty('/messages').forEach(function (message) {
        container.addItem(
          message.role === 'user' ? this._userMessage(message) : this._assistantMessage(message)
        )
      }.bind(this))
    },

    /**
     * Never pass generated text through a control constructor: ManagedObject runs
     * the binding parser over settings, so {placeholder} tokens would be swallowed
     * as binding paths. Setters take the string as-is.
     */
    _html: function (content) {
      var html = new HTML({ sanitizeContent: false })
      html.setContent(content)
      return html
    },

    // Rendered as plain HTML: a UI5 FlexBox would wrap the bubble in a flex item
    // that shrinks to min-content and breaks short messages across lines.
    _userMessage: function (message) {
      return this._html(
        '<div class="menRow menRow--user"><div class="menBubble">' +
          markdown.escapeHtml(message.text) +
          '</div></div>'
      )
    },

    _assistantMessage: function (message) {
      var row = new VBox().addStyleClass('menRow menRow--assistant')
      if (message.kind === 'error') row.addStyleClass('menRow--error')

      row.addItem(this._html('<div class="menMd">' + markdown.render(message.text) + '</div>'))

      var calls = message.toolCalls || []
      var available = message.toolsAvailable || []
      if (calls.length || available.length) {
        row.addItem(this._thinkingPanel(calls, available))
      }
      return row
    },

    /**
     * The collapsed "Thinking" disclosure: what tools were on the table this run,
     * and — step by step — which the agent actually called, with the arguments it
     * passed and the raw data that came back.
     */
    _thinkingPanel: function (calls, available) {
      var esc = markdown.escapeHtml

      var label = calls.length === 0
        ? 'Thinking · answered without calling a tool'
        : calls.length === 1
          ? 'Thinking · 1 tool call'
          : 'Thinking · ' + calls.length + ' tool calls'

      var head = new Toolbar({
        content: [
          new Icon({ src: 'sap-icon://developer-settings' }).addStyleClass('menThinkIcon'),
          new Text({ text: label }).addStyleClass('menThinkLabel'),
          new ToolbarSpacer(),
        ],
      }).addStyleClass('menThinkBar')

      var parts = []

      if (available.length) {
        parts.push(
          '<div class="menAvail"><span class="menAvailLabel">Tools available this run (' +
            available.length + ')</span> ' +
            available.map(function (n) { return '<code>' + esc(n) + '</code>' }).join(' ') +
          '</div>'
        )
      }

      calls.forEach(function (call, i) {
        parts.push(
          '<div class="menTool">' +
            '<div class="menToolHead"><span class="menToolStep">' + (i + 1) + '</span>' +
              '<span class="menToolName">' + esc(call.tool || 'tool') + '</span></div>' +
            '<div class="menToolKey">arguments</div>' +
            '<pre class="menToolCode">' + esc(pretty(call.args)) + '</pre>' +
            '<div class="menToolKey">result</div>' +
            '<pre class="menToolCode menToolCode--out">' + esc(pretty(call.output)) + '</pre>' +
          '</div>'
        )
      })

      var panel = new Panel({
        expandable: true,
        expanded: false,
        headerToolbar: head,
        content: [this._html('<div class="menThinkBody">' + parts.join('') + '</div>')],
      }).addStyleClass('menThink')

      return panel
    },

    // Assign scrollTop directly: ScrollContainer#scrollTo does not move this
    // container, and smooth scrolling stalls when the tab is not in the foreground.
    _scrollToBottom: function () {
      var scroll = this.byId('scroll')
      setTimeout(function () {
        var dom = scroll.getDomRef()
        if (dom) dom.scrollTop = dom.scrollHeight
      }, 60)
    },
  })

  function pretty(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'string') {
      try { return JSON.stringify(JSON.parse(value), null, 2) } catch (e) { return value }
    }
    try { return JSON.stringify(value, null, 2) } catch (e) { return String(value) }
  }
})
