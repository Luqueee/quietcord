import type {Snowflake} from '../domain/types.js';

export type ApiResult =
  | {kind: 'ok'; status: number; body: unknown}
  | {kind: 'network'; cause: string}
  | {kind: 'ratelimit'; status: number; retryAfterMs: number; body: unknown};

const API = 'https://discord.com/api/v10';

export class Rest {
  private token: string;
  private userAgent: string;

  constructor(token: string, userAgent = 'quietcord (https://github.com/local, v0.1.0)') {
    if (!token) throw new Error('token is required');
    this.token = token;
    this.userAgent = userAgent;
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<ApiResult> {
    const url = `${API}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        authorization: this.token,
        'user-agent': this.userAgent,
        'content-type': 'application/json',
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      return {kind: 'network', cause};
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after')) || 1;
      const retryAfterMs = Math.max(ra * 1000, 1000);
      return {kind: 'ratelimit', status: 429, retryAfterMs, body: parsed};
    }
    return {kind: 'ok', status: res.status, body: parsed};
  }
}

export type RatelimitState = {until: number};

export function applyRatelimit(state: RatelimitState, retryAfterMs: number): void {
  state.until = Date.now() + retryAfterMs;
}

export function isRatelimited(state: RatelimitState): boolean {
  return Date.now() < state.until;
}

export function waitForRatelimit(state: RatelimitState): Promise<void> {
  const wait = state.until - Date.now();
  if (wait <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, wait));
}

export type SendItem = {channelId: Snowflake; content: string};
