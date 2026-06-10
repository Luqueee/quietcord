import {WebSocket} from 'ws';
import type {Snowflake, ReadyPayload, Message, User, VoiceState, Guild} from '../domain/types.js';
import {log} from '../infra/log.js';
import {TypedEmitter} from './event-bus.js';

const DEFAULT_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

export type Gateway = TypedEmitter & {
  connect(resumeUrl?: string | null): void;
  close(): void;
  setResumeContext(sessionId: string, url: string, seq: number | null): void;
  isOpen(): boolean;
};

type Dispatch = {op: number; s: number | null; d: unknown; t?: string};

export function createGateway(
  token: string,
  intents: number,
  gatewayUrl: string = DEFAULT_GATEWAY
): Gateway {
  const emitter = new TypedEmitter();
  let ws: WebSocket | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let seq: number | null = null;
  let sessionId: string | null = null;
  let resumeUrl: string | null = null;
  let closed = false;
  let gatewayReady = false;

  function setResumeContext(sid: string, url: string, s: number | null): void {
    sessionId = sid;
    resumeUrl = url;
    seq = s;
  }

  function isOpen(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  function sendOpcode(op: number, d: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({op, d}));
  }

  function identify(): void {
    sendOpcode(2, {
      token,
      intents,
      properties: {os: 'linux', browser: 'quietcord', device: 'quietcord'},
      presence: {status: 'online', since: 0, activities: [], afk: false},
    });
  }

  function startHeartbeat(intervalMs: number): void {
    if (heartbeat) clearInterval(heartbeat);
    const tick = (): void => {
      sendOpcode(1, seq);
    };
    tick();
    heartbeat = setInterval(tick, intervalMs);
  }

  function handleDispatch(p: Dispatch): void {
    if (p.op === 10) {
      const d = p.d as {heartbeat_interval: number};
      startHeartbeat(d.heartbeat_interval);
      return;
    }
    if (p.op === 0 && p.t) {
      switch (p.t) {
        case 'READY': {
          const d = p.d as ReadyPayload;
          sessionId = d.session_id;
          resumeUrl = d.resume_gateway_url;
          gatewayReady = true;
          emitter.emit('READY', d);
          break;
        }
        case 'RESUMED':
          gatewayReady = true;
          emitter.emit('RESUMED', undefined as never);
          break;
        case 'MESSAGE_CREATE':
          emitter.emit('MESSAGE_CREATE', p.d as Message);
          break;
        case 'MESSAGE_UPDATE':
          emitter.emit('MESSAGE_UPDATE', p.d as Message);
          break;
        case 'MESSAGE_DELETE':
          emitter.emit('MESSAGE_DELETE', p.d as {id: Snowflake; channel_id: Snowflake});
          break;
        case 'MESSAGE_DELETE_BULK': {
          const d = p.d as {ids: Snowflake[]; channel_id: Snowflake};
          for (const id of d.ids) {
            emitter.emit('MESSAGE_DELETE', {id, channel_id: d.channel_id});
          }
          break;
        }
        case 'GUILD_CREATE':
          (emitter.emit as (e: string, p: unknown) => boolean)('GUILD_CREATE', p.d);
          break;
        case 'VOICE_STATE_UPDATE':
          emitter.emit('VOICE_STATE_UPDATE', p.d as VoiceState);
          break;
        default:
          break;
      }
    }
  }

  function connect(urlToUse?: string | null): void {
    if (closed) return;
    const target = urlToUse ?? resumeUrl ?? gatewayUrl;
    log('gateway: connecting to', target);
    const next = new WebSocket(target);
    ws = next;

    next.on('open', () => {
      log('gateway: open');
      if (sessionId && resumeUrl) {
        sendOpcode(6, {token, session_id: sessionId, seq});
      } else {
        identify();
      }
    });

    next.on('message', raw => {
      let payload: Dispatch;
      try {
        payload = JSON.parse(raw.toString()) as Dispatch;
      } catch {
        return;
      }
      if (payload.s != null) seq = payload.s;
      if (payload.t) log('gateway: dispatch', payload.t);
      else if (payload.op === 11) log('gateway: heartbeat ack');
      else if (payload.op === 10) log('gateway: hello');
      handleDispatch(payload);
    });

    next.on('close', code => {
      log('gateway: close', code);
      gatewayReady = false;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      ws = null;
      emitter.emit('CLOSE' as never, code as never);
      if (closed) return;
      const delay = code === 4004 || code === 4014 ? 30000 : 2000;
      setTimeout(() => connect(null), delay);
    });

    next.on('error', err => {
      log('gateway: error', err.message);
      emitter.emit('ERROR', err);
    });
  }

  function close(): void {
    closed = true;
    gatewayReady = false;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (ws) {
      try {
        ws.close();
      } catch {}
      ws = null;
    }
    emitter.removeAllListeners();
  }

  const gateway: Gateway = Object.assign(emitter, {
    connect,
    close,
    setResumeContext,
    isOpen,
  });
  return gateway;
}

export type {User};
