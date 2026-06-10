import {EventEmitter} from 'node:events';
import {log} from '../infra/log.js';
import type {Message, Snowflake, User, Guild, VoiceState, ReadyPayload} from '../domain/types.js';
import {Rest, type RatelimitState, applyRatelimit, waitForRatelimit} from './rest.js';
import {createGateway, type Gateway} from './gateway.js';

export type SendResult =
  | {ok: true; message: Message | null; queued: boolean; position?: number}
  | {ok: false; kind: 'network'; cause: string}
  | {ok: false; kind: 'auth'; status: number; message: string}
  | {ok: false; kind: 'ratelimit'; retryAfterMs: number}
  | {ok: false; kind: 'other'; status: number; message: string};

type QueueItem = {channelId: Snowflake; content: string; attempts: number; enqueuedAt: number};

const INTENTS = (1 << 0) | (1 << 9) | (1 << 15) | (1 << 7);
const MAX_QUEUE_SIZE = 50;
const MAX_SEND_ATTEMPTS = 5;

export class DiscordClient extends EventEmitter {
  private token: string;
  private rest: Rest;
  private gateway: Gateway;
  private sendQueue: QueueItem[] = [];
  private flushingQueue = false;
  private ratelimit: RatelimitState = {until: 0};
  private user: User | null = null;
  private guilds: Guild[] = [];
  private voiceStates = new Map<Snowflake, VoiceState>();
  private gatewayReady = false;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private seq: number | null = null;

  constructor(token: string) {
    super();
    if (!token) throw new Error('token is required');
    this.token = token;
    this.rest = new Rest(token);
    this.gateway = createGateway(token, INTENTS);
    this.wireGateway();
  }

  private wireGateway(): void {
    this.gateway.on('READY', (p: ReadyPayload) => {
      this.user = p.user;
      this.sessionId = p.session_id;
      this.resumeUrl = p.resume_gateway_url;
      this.guilds = p.guilds;
      this.voiceStates.clear();
      this.gatewayReady = true;
      this.emit('ready', {user: p.user, guilds: p.guilds});
      void this.flushQueue();
    });
    this.gateway.on('RESUMED', () => {
      this.gatewayReady = true;
      this.emit('resumed');
      void this.flushQueue();
    });
    this.gateway.on('MESSAGE_CREATE', (m: Message) => this.emit('message', m));
    this.gateway.on('MESSAGE_UPDATE', (m: Message) => this.emit('messageUpdate', m));
    this.gateway.on('MESSAGE_DELETE', (d: {id: Snowflake; channel_id: Snowflake}) =>
      this.emit('messageDelete', d)
    );
    this.gateway.on('VOICE_STATE_UPDATE', (vs: VoiceState) => {
      if (vs.channel_id) this.voiceStates.set(vs.user_id, vs);
      else this.voiceStates.delete(vs.user_id);
      this.emit('voiceStateUpdate', vs);
    });
    this.gateway.on('ERROR', (err: Error) => this.emit('error', err));
  }

  async login(): Promise<void> {
    log('login: GET /users/@me');
    const res = await this.rest.request('GET', '/users/@me');
    if (res.kind === 'network') throw new Error(`network error: ${res.cause}`);
    if (res.status === 401) throw new Error('invalid token (401)');
    if (res.kind !== 'ok') throw new Error(`auth failed: ${res.status}`);
    this.user = res.body as User;
    log('login: user', this.user.username, this.user.id);
    this.gateway.connect();
  }

  async destroy(): Promise<void> {
    this.gatewayReady = false;
    this.gateway.close();
    this.sendQueue = [];
    this.emit('queueUpdate', 0);
  }

  getUser(): User | null {
    return this.user;
  }

  getGuilds(): Guild[] {
    return this.guilds;
  }

  getVoiceStatesForChannel(channelId: Snowflake): VoiceState[] {
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
      const res = await this.rest.request('POST', `/channels/${channelId}/messages`, {content});
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

  private enqueue(channelId: Snowflake, content: string): SendResult {
    if (this.sendQueue.length >= MAX_QUEUE_SIZE) {
      this.sendQueue.shift();
    }
    const item: QueueItem = {channelId, content, attempts: 0, enqueuedAt: Date.now()};
    this.sendQueue.push(item);
    this.emit('queueUpdate', this.sendQueue.length);
    log('queue: enqueued, size=', this.sendQueue.length);
    void this.flushQueue();
    return {ok: true, message: null, queued: true, position: this.sendQueue.length};
  }

  private async flushQueue(): Promise<void> {
    if (this.flushingQueue) return;
    this.flushingQueue = true;
    try {
      while (this.sendQueue.length > 0) {
        if (this.ratelimit.until > Date.now()) {
          await waitForRatelimit(this.ratelimit);
        }
        const item = this.sendQueue[0];
        if (!item) break;
        item.attempts += 1;
        if (item.attempts > MAX_SEND_ATTEMPTS) {
          this.dropItem(item, 'max retries');
          continue;
        }
        const res = await this.rest.request('POST', `/channels/${item.channelId}/messages`, {
          content: item.content,
        });
        if (res.kind === 'network') {
          log('queue: network error, will retry', res.cause);
          await new Promise(r => setTimeout(r, 1000 * Math.min(item.attempts, 5)));
          continue;
        }
        if (res.kind === 'ratelimit') {
          applyRatelimit(this.ratelimit, res.retryAfterMs);
          log('queue: hit rate limit, retry after', res.retryAfterMs, 'ms');
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          log('queue: auth error, dropping', res.status);
          this.dropItem(item, 'unauthorized');
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
        this.dropItem(item, `status ${res.status}`);
      }
    } finally {
      this.flushingQueue = false;
    }
  }

  private dropItem(item: QueueItem, reason: string): void {
    log('queue: dropping', reason, item.content.slice(0, 30));
    this.sendQueue.shift();
    this.emit('queueUpdate', this.sendQueue.length);
    this.emit('sendFailed', {channelId: item.channelId, content: item.content, reason});
  }

  async fetchHistory(channelId: Snowflake, limit = 50): Promise<Message[]> {
    const res = await this.rest.request(
      'GET',
      `/channels/${channelId}/messages?limit=${Math.min(Math.max(limit, 1), 100)}`
    );
    if (res.kind !== 'ok') throw new Error('history failed');
    if (res.status < 200 || res.status >= 300) throw new Error(`history failed: ${res.status}`);
    return res.body as Message[];
  }
}
