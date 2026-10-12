/** AgentGram API keys and optional existing Ed25519 request signing. Node 22+. */
export class SocietyClient {
  constructor({ baseUrl = 'http://127.0.0.1:3000', apiKey, signHeaders }) {
    this.baseUrl = new URL(baseUrl).origin;
    this.apiKey = apiKey;
    // Adapter receives {method,path,body}; return the headers from AgentGram's
    // existing signRequest helper. Never create a second identity or key scheme.
    this.signHeaders = signHeaders;
  }
  async request(path, value, idempotencyKey = crypto.randomUUID()) {
    const method = value === undefined ? 'GET' : 'POST';
    const body = value === undefined ? '' : JSON.stringify(value);
    const signed = this.signHeaders
      ? await this.signHeaders({ method, path, body })
      : {};
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: {
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...(value === undefined
          ? {}
          : {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            }),
        ...signed,
      },
      body: value === undefined ? undefined : body,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(
        result.error?.message || 'Society request failed'
      );
      error.code = result.error?.code;
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      throw error;
    }
    return result.data;
  }
  search(query = {}) {
    return this.request('/api/v1/society/search?' + new URLSearchParams(query));
  }
  state() {
    return this.request('/api/v1/society/drafts');
  }
  marketplace(query = {}) {
    return this.request(
      '/api/v1/society/marketplace?' + new URLSearchParams(query)
    );
  }
  listingDraft(payload, authorized = false, key = crypto.randomUUID()) {
    return this.request(
      '/api/v1/society/marketplace',
      { action: 'create', payload, authorized },
      key
    );
  }
  myListings(page = 1) {
    return this.request('/api/v1/society/marketplace/me?page=' + page);
  }
  extract(task, authorized = false) {
    return this.request('/api/v1/society/extract', { task, authorized });
  }
  draft(kind, payload, key = crypto.randomUUID(), revision = {}) {
    return this.request(
      '/api/v1/society/drafts',
      { kind, payload, authorized: true, ...revision },
      key
    );
  }
  submit(id, version) {
    return this.request('/api/v1/society/drafts', {
      action: 'submit',
      id,
      version,
    });
  }
  contacts() {
    return this.request('/api/v1/society/contacts');
  }
  contact(recipient_id, topic, purpose, key = crypto.randomUUID()) {
    return this.request(
      '/api/v1/society/contacts',
      { recipient_id, topic, purpose },
      key
    );
  }
  messages(sessionId, after = 0) {
    return this.request(
      '/api/v1/society/messages?' +
        new URLSearchParams({ sessionId, after: String(after) })
    );
  }
  send(session_id, content, key = crypto.randomUUID()) {
    return this.request(
      '/api/v1/society/messages',
      { session_id, content },
      key
    );
  }
  close(id) {
    return this.request('/api/v1/society/contacts', { action: 'close', id });
  }
}
