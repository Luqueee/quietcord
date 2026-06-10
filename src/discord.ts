import {WebSocket} from 'ws';
import {EventEmitter} from 'node:events';
import {log} from './logger.js';
import type {Snowflake, User, Channel, Guild, Message, VoiceState, ReadyPayload} from './domain/types.js';

const API = 'https://discord.com/api/v10';
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

export type {Snowflake, User, Channel, Guild, Message, VoiceState, ReadyPayload} from './domain/types.js';

export type GatewayMessage = {
  id: Snowflake;
  channel_id: Snowflake;
  content: string;
  author: User;
  timestamp: string;
  edited_timestamp?: string | null;
};

export type SendResult =
  | {ok: true; message: Message; queued: false}
  | {ok: true; message: null; queued: true; position: number}
  | {ok: false; kind: 'network'; cause: string}
  | {ok: false; kind: 'auth'; status: number; message: string}
  | {ok: false; kind: 'ratelimit'; retryAfterMs: number}
  | {ok: false; kind: 'other'; status: number; message: string};

type QueueItem = {
  channelId: string;
  content: string;
  attempts: number;
  enqueuedAt: number;
};

const CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  GUILD_VOICE: 2,
  GUILD_CATEGORY: 4,
  GUILD_NEWS: 5,
  GUILD_STAGE: 13,
} as const;

const isTextType = (t: number) => t === CHANNEL_TYPES.GUILD_TEXT || t === CHANNEL_TYPES.GUILD_NEWS;
const isVoiceType = (t: number) => t === CHANNEL_TYPES.GUILD_VOICE || t === CHANNEL_TYPES.GUILD_STAGE;

type ApiResult =
  | {kind: 'ok'; status: number; body: unknown}
  | {kind: 'network'; cause: string}
  | {kind: 'ratelimit'; status: number; retryAfterMs: number; body: unknown};

export class DiscordClient extends EventEmitter {
  private token: string;
  private ws: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private user: User | null = null;
  private guilds: Guild[] = [];
  private voiceStates = new Map<string, VoiceState>();
  private intents = (1 << 0) | (1 << 9) | (1 << 15) | (1 << 7);
  private closed = false;
  private sendQueue: QueueItem[] = [];
  private flushingQueue = false;
  private ratelimitUntil = 0;
  private maxQueueSize = 50;
  private maxSendAttempts = 5;
  private gatewayReady = false;

  constructor(token: string) {
    super();
    if (!token) throw new Error('token is required');
    this.token = token;
  }

  async login(): Promise<void> {
    log('login: GET /users/@me');
    const res = await this.api('GET', '/users/@me');
    if (res.kind === 'network') throw new Error(`network error: ${res.cause}`);
    if (res.status === 401) throw new Error('invalid token (401)');
    if (res.kind !== 'ok') throw new Error(`auth failed: ${res.status}`);
    this.user = res.body as User;
    log('login: user', this.user.username, this.user.id);
    this.connectGateway();
  }

  async destroy(): Promise<void> {
    this.closed = true;
    this.gatewayReady = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.sendQueue = [];
    this.emit('queueUpdate', 0);
  }

  getUser(): User | null {
    return this.user;
  }

  getGuilds(): Guild[] {
    return this.guilds;
  }

  getVoiceStatesForChannel(channelId: string): VoiceState[] {
    const out: VoiceState[] = [];
    for (const vs of this.voiceStates.values()) {
      if (vs.channel_id === channelId) out.push(vs);
    }
    return out;
  }

  getQueueLength(): number {
    return this.sendQueue.length;
  }

  async sendMessage(channelId: Snowflake, content: string): Promise<SendResult> {
    if (content.length === 0 || content.length > 2000) {
      return {ok: false, kind: 'other', status: 0, message: 'message must be 1-2000 chars'};
    }

    if (this.gatewayReady) {
      const res = await this.api('POST', `/channels/${channelId}/messages`, {content});
      if (res.kind === 'ok' && res.status >= 200 && res.status < 300) {
        this.emit('messageSent', res.body as Message);
        return {ok: true, message: res.body as Message, queued: false};
      }
      if (res.kind === 'network') {
        log('send: network, falling back to queue');
        return this.enqueue(channelId, content);
      }
      if (res.kind === 'ratelimit') {
        log('send: rate limited, enqueueing for later');
        return this.enqueue(channelId, content);
      }
      if (res.status === 401 || res.status === 403) {
        return {ok: false, kind: 'auth', status: res.status, message: 'unauthorized'};
      }
      return {ok: false, kind: 'other', status: res.status ?? 0, message: 'send failed'};
    }

    log('send: gateway not ready, enqueueing');
    return this.enqueue(channelId, content);
  }

  private enqueue(channelId: string, content: string): SendResult {
    if (this.sendQueue.length >= this.maxQueueSize) {
      this.sendQueue.shift();
    }
    const item: QueueItem = {
      channelId,
      content,
      attempts: 0,
      enqueuedAt: Date.now(),
    };
    this.sendQueue.push(item);
    this.emit('queueUpdate', this.sendQueue.length);
    log('queue: enqueued, size=', this.sendQueue.length);
    void this.flushQueue();
    return {ok: true, message: null, queued: true, position: this.sendQueue.length};
  }

  async flushQueue(): Promise<void> {
    if (this.flushingQueue) return;
    this.flushingQueue = true;
    try {
      while (this.sendQueue.length > 0 && !this.closed) {
        if (Date.now() < this.ratelimitUntil) {
          const wait = this.ratelimitUntil - Date.now();
          log('queue: rate-limited, waiting', wait, 'ms');
          await new Promise(r => setTimeout(r, wait));
          if (this.closed) break;
        }
        const item = this.sendQueue[0];
        item.attempts += 1;
        if (item.attempts > this.maxSendAttempts) {
          log('queue: dropping after max attempts', item.content.slice(0, 30));
          this.sendQueue.shift();
          this.emit('queueUpdate', this.sendQueue.length);
          this.emit('sendFailed', {channelId: item.channelId, content: item.content, reason: 'max retries'});
          continue;
        }
        const res = await this.api('POST', `/channels/${item.channelId}/messages`, {content: item.content});
        if (res.kind === 'network') {
          log('queue: network error, will retry', res.cause);
          await new Promise(r => setTimeout(r, 1000 * Math.min(item.attempts, 5)));
          continue;
        }
        if (res.kind === 'ratelimit') {
          this.ratelimitUntil = Date.now() + res.retryAfterMs;
          log('queue: hit rate limit, retry after', res.retryAfterMs, 'ms');
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          log('queue: auth error, dropping', res.status);
          this.sendQueue.shift();
          this.emit('queueUpdate', this.sendQueue.length);
          this.emit('sendFailed', {channelId: item.channelId, content: item.content, reason: 'unauthorized'});
          continue;
        }
        if (res.kind === 'ok' && res.status >= 200 && res.status < 300) {
          this.sendQueue.shift();
          this.emit('queueUpdate', this.sendQueue.length);
          this.emit('messageSent', res.body as Message);
          log('queue: sent, remaining', this.sendQueue.length);
          continue;
        }
        log('queue: other error', res.kind, res.status);
        this.sendQueue.shift();
        this.emit('queueUpdate', this.sendQueue.length);
        this.emit('sendFailed', {channelId: item.channelId, content: item.content, reason: `status ${res.status}`});
      }
    } finally {
      this.flushingQueue = false;
    }
  }

  async fetchHistory(channelId: Snowflake, limit = 50): Promise<Message[]> {
    const res = await this.api(
      'GET',
      `/channels/${channelId}/messages?limit=${Math.min(Math.max(limit, 1), 100)}`
    );
    if (res.kind !== 'ok' || !res.status) throw new Error(`history failed`);
    if (res.status < 200 || res.status >= 300) throw new Error(`history failed: ${res.status}`);
    return res.body as Message[];
  }

  private async api(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<ApiResult> {
    const url = `${API}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        authorization: this.token,
        'user-agent': 'quietcord (https://github.com/local, v0.1.0)',
        'content-type': 'application/json',
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      log('api: network error', method, path, cause);
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
      log('api: 429, retry after', retryAfterMs, 'ms');
      return {kind: 'ratelimit', status: 429, retryAfterMs, body: parsed};
    }
    return {kind: 'ok', status: res.status, body: parsed};
  }

  private connectGateway() {
    const url = this.resumeGatewayUrl ?? GATEWAY;
    log('gateway: connecting to', url);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      log('gateway: open');
      if (this.sessionId && this.resumeGatewayUrl) {
        this.sendOpcode(6, {
          token: this.token,
          session_id: this.sessionId,
          seq: this.seq,
        });
      } else {
        this.identify();
      }
    });

    ws.on('message', raw => {
      let payload: {op: number; s: number | null; d: unknown; t?: string};
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (payload.s != null) this.seq = payload.s;
      if (payload.t) log('gateway: dispatch', payload.t);
      else if (payload.op === 11) log('gateway: heartbeat ack');
      else if (payload.op === 10) log('gateway: hello');
      this.handleDispatch(payload);
    });

    ws.on('close', code => {
      log('gateway: close', code);
      this.gatewayReady = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      if (this.closed) return;
      const delay = code === 4004 || code === 4014 ? 30000 : 2000;
      setTimeout(() => this.connectGateway(), delay);
    });

    ws.on('error', err => {
      log('gateway: error', err.message);
      this.emit('error', err);
    });
  }

  private sendOpcode(op: number, d: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({op, d}));
  }

  private identify() {
    this.sendOpcode(2, {
      token: this.token,
      intents: this.intents,
      properties: {
        os: 'linux',
        browser: 'quietcord',
        device: 'quietcord',
      },
      presence: {status: 'online', since: 0, activities: [], afk: false},
    });
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const tick = () => this.sendOpcode(1, this.seq);
    tick();
    this.heartbeat = setInterval(tick, intervalMs);
  }

  private handleDispatch(p: {op: number; d: unknown; t?: string}) {
    if (p.op === 10) {
      const d = p.d as {heartbeat_interval: number};
      this.startHeartbeat(d.heartbeat_interval);
      return;
    }
    if (p.op === 0 && p.t) {
      switch (p.t) {
        case 'READY': {
          const d = p.d as ReadyPayload;
          this.user = d.user;
          this.sessionId = d.session_id;
          this.resumeGatewayUrl = d.resume_gateway_url;
          this.guilds = d.guilds;
          this.voiceStates.clear();
          this.gatewayReady = true;
          this.emit('ready', {user: d.user, guilds: d.guilds});
          void this.flushQueue();
          break;
        }
        case 'RESUMED':
          this.gatewayReady = true;
          this.emit('resumed');
          void this.flushQueue();
          break;
        case 'MESSAGE_CREATE': {
          const m = p.d as GatewayMessage;
          this.emit('message', m);
          break;
        }
        case 'MESSAGE_UPDATE': {
          const m = p.d as GatewayMessage;
          this.emit('messageUpdate', m);
          break;
        }
        case 'MESSAGE_DELETE': {
          const d = p.d as {id: string; channel_id: string};
          this.emit('messageDelete', d);
          break;
        }
        case 'MESSAGE_DELETE_BULK': {
          const d = p.d as {ids: string[]; channel_id: string};
          for (const id of d.ids) {
            this.emit('messageDelete', {id, channel_id: d.channel_id});
          }
          break;
        }
        case 'GUILD_CREATE': {
          const g = p.d as Guild;
          const idx = this.guilds.findIndex(x => x.id === g.id);
          if (idx >= 0) this.guilds[idx] = g;
          else this.guilds.push(g);
          this.emit('guildUpdate', g);
          break;
        }
        case 'VOICE_STATE_UPDATE': {
          const vs = p.d as VoiceState;
          if (vs.channel_id) {
            this.voiceStates.set(vs.user_id, vs);
          } else {
            this.voiceStates.delete(vs.user_id);
          }
          this.emit('voiceStateUpdate', vs);
          break;
        }
        default:
          break;
      }
    }
  }
}
