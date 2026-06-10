import {describe, it, expect} from 'vitest';
import {reduce, initialAppState, type AppState} from '../../src/state/machine.js';
import type {Channel, Guild, User, Message} from '../../src/domain/types.js';

function readyState(): AppState {
  const user: User = {id: 'u1', username: 'me', discriminator: '0001'};
  return reduce(initialAppState, {type: 'ready', user, guilds: []});
}

describe('state/machine', () => {
  it('init sets the client', () => {
    const fakeClient = {fake: true} as never;
    const s = reduce(initialAppState, {type: 'init', client: fakeClient});
    expect(s.client).toBe(fakeClient);
  });

  it('ready populates self and guilds', () => {
    const user: User = {id: 'u1', username: 'me', discriminator: '0001'};
    const s = reduce(initialAppState, {type: 'ready', user, guilds: [{label: 'g', value: 'g1'}]});
    expect(s.status).toBe('ready');
    expect(s.selfId).toBe('u1');
    expect(s.selfName).toBe('me');
    expect(s.guilds).toEqual([{label: 'g', value: 'g1'}]);
  });

  it('error sets error and status', () => {
    const s = reduce(initialAppState, {type: 'error', error: 'boom'});
    expect(s.status).toBe('error');
    expect(s.error).toBe('boom');
  });

  it('pick-mode normal goes to guilds', () => {
    const s = reduce(readyState(), {type: 'pick-mode', mode: 'normal'});
    expect(s.mode).toBe('normal');
    expect(s.view).toBe('guilds');
  });

  it('pick-mode stealth goes to stealth-guilds', () => {
    const s = reduce(readyState(), {type: 'pick-mode', mode: 'stealth'});
    expect(s.mode).toBe('stealth');
    expect(s.view).toBe('stealth-guilds');
  });

  it('enter-guild stores guild and channels; view branches by mode', () => {
    const guild: Guild = {id: 'g1', name: 'g', channels: []};
    const normal = reduce(readyState(), {type: 'pick-mode', mode: 'normal'});
    const sN = reduce(normal, {type: 'enter-guild', guild, channels: []});
    expect(sN.view).toBe('channels');

    const stealth = reduce(readyState(), {type: 'pick-mode', mode: 'stealth'});
    const sS = reduce(stealth, {type: 'enter-guild', guild, channels: []});
    expect(sS.view).toBe('stealth-channels');
  });

  it('enter-channel clears messages, draft, unread; sets view=chat', () => {
    const guild: Guild = {id: 'g1', name: 'g', channels: []};
    const channel: Channel = {id: 'c1', name: 'c', type: 0};
    let s = reduce(readyState(), {type: 'pick-mode', mode: 'normal'});
    s = reduce(s, {type: 'enter-guild', guild, channels: []});
    s = reduce(s, {type: 'set-draft', draft: 'leftover'});
    s = reduce(s, {type: 'unread-increment'});
    s = reduce(s, {type: 'enter-channel', channel});
    expect(s.view).toBe('chat');
    expect(s.draft).toBe('');
    expect(s.messages).toEqual([]);
    expect(s.unread).toBe(0);
  });

  it('enter-channel in stealth forces historyVisible=false', () => {
    const guild: Guild = {id: 'g1', name: 'g', channels: []};
    const channel: Channel = {id: 'c1', name: 'c', type: 0};
    let s = reduce(readyState(), {type: 'pick-mode', mode: 'stealth'});
    s = reduce(s, {type: 'enter-guild', guild, channels: []});
    s = reduce(s, {type: 'toggle-history'});
    s = reduce(s, {type: 'enter-channel', channel});
    expect(s.historyVisible).toBe(false);
  });

  it('leave-channel routes by mode', () => {
    const guild: Guild = {id: 'g1', name: 'g', channels: []};
    const channel: Channel = {id: 'c1', name: 'c', type: 0};
    let s = reduce(readyState(), {type: 'pick-mode', mode: 'normal'});
    s = reduce(s, {type: 'enter-guild', guild, channels: []});
    s = reduce(s, {type: 'enter-channel', channel});
    s = reduce(s, {type: 'leave-channel'});
    expect(s.view).toBe('channels');

    let t = reduce(readyState(), {type: 'pick-mode', mode: 'stealth'});
    t = reduce(t, {type: 'enter-guild', guild, channels: []});
    t = reduce(t, {type: 'enter-channel', channel});
    t = reduce(t, {type: 'leave-channel'});
    expect(t.view).toBe('stealth-channels');
  });

  it('go-to-* actions reset navigation and channel state', () => {
    const guild: Guild = {id: 'g1', name: 'g', channels: []};
    const channel: Channel = {id: 'c1', name: 'c', type: 0};
    let s = reduce(readyState(), {type: 'pick-mode', mode: 'normal'});
    s = reduce(s, {type: 'enter-guild', guild, channels: []});
    s = reduce(s, {type: 'enter-channel', channel});

    s = reduce(s, {type: 'go-to-guilds'});
    expect(s.view).toBe('guilds');
    expect(s.currentGuild).toBe(null);
    expect(s.currentChannel).toBe(null);

    s = reduce(s, {type: 'go-to-mode-select'});
    expect(s.view).toBe('mode-select');
    expect(s.mode).toBe(null);
  });

  it('toggle-history flips historyVisible', () => {
    const a = reduce(initialAppState, {type: 'toggle-history'});
    expect(a.historyVisible).toBe(true);
    const b = reduce(a, {type: 'toggle-history'});
    expect(b.historyVisible).toBe(false);
  });

  it('append-message dedupes by id and respects MAX_MESSAGES', () => {
    const base: AppState = {...readyState(), messages: []};
    const m1 = {id: 'a', author: 'a', authorId: 'a', content: 'x', isMe: false, ts: 1};
    const m2 = {id: 'a', author: 'a', authorId: 'a', content: 'x2', isMe: false, ts: 2};
    const s1 = reduce(base, {type: 'append-message', message: m1});
    const s2 = reduce(s1, {type: 'append-message', message: m2});
    expect(s2.messages).toHaveLength(1);
    expect(s2.messages[0]?.content).toBe('x2');
  });

  it('confirm-pending replaces optimistic by tempId', () => {
    const base: AppState = {
      ...readyState(),
      messages: [{id: 'pending-123', author: 'me', authorId: 'u1', content: 'hello', isMe: true, ts: 100}],
    };
    const real = {id: 'real-999', author: 'me', authorId: 'u1', content: 'hello', isMe: true, ts: 101};
    const s = reduce(base, {type: 'confirm-pending', tempId: 'pending-123', message: real});
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.id).toBe('real-999');
    expect(s.messages[0]?.content).toBe('hello');
  });

  it('confirm-pending appends if tempId not found and real id is new', () => {
    const base: AppState = {...readyState(), messages: []};
    const real = {id: 'real-999', author: 'me', authorId: 'u1', content: 'hello', isMe: true, ts: 101};
    const s = reduce(base, {type: 'confirm-pending', tempId: 'pending-not-here', message: real});
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.id).toBe('real-999');
  });

  it('confirm-pending is a no-op if real id already exists', () => {
    const real = {id: 'real-999', author: 'me', authorId: 'u1', content: 'hello', isMe: true, ts: 101};
    const base: AppState = {...readyState(), messages: [real]};
    const s = reduce(base, {type: 'confirm-pending', tempId: 'pending-123', message: real});
    expect(s.messages).toHaveLength(1);
  });

  it('replace-message updates content and editedAt', () => {
    let s = reduce(readyState(), {
      type: 'append-message',
      message: {id: 'a', author: 'a', authorId: 'a', content: 'x', isMe: false, ts: 1},
    });
    s = reduce(s, {type: 'replace-message', id: 'a', content: 'y', editedAt: 5});
    expect(s.messages[0]?.content).toBe('y');
    expect(s.messages[0]?.editedAt).toBe(5);
  });

  it('delete-message marks message as deleted', () => {
    let s = reduce(readyState(), {
      type: 'append-message',
      message: {id: 'a', author: 'a', authorId: 'a', content: 'x', isMe: false, ts: 1},
    });
    s = reduce(s, {type: 'delete-message', id: 'a'});
    expect(s.messages[0]?.deleted).toBe(true);
  });

  it('set-draft / clear-draft / draft-backspace', () => {
    let s = reduce(readyState(), {type: 'set-draft', draft: 'hello'});
    expect(s.draft).toBe('hello');
    s = reduce(s, {type: 'draft-backspace'});
    expect(s.draft).toBe('hell');
    s = reduce(s, {type: 'clear-draft'});
    expect(s.draft).toBe('');
  });

  it('unread-increment and unread-clear', () => {
    let s = reduce(readyState(), {type: 'unread-increment'});
    s = reduce(s, {type: 'unread-increment'});
    expect(s.unread).toBe(2);
    s = reduce(s, {type: 'unread-clear'});
    expect(s.unread).toBe(0);
  });

  it('queue-update and voice-update set their fields', () => {
    let s = reduce(readyState(), {type: 'queue-update', size: 3});
    expect(s.queueSize).toBe(3);
    s = reduce(s, {type: 'voice-update', states: []});
    expect(s.voiceStates).toEqual([]);
  });

  it('history-loading toggles loadingHistory', () => {
    const s = reduce(readyState(), {type: 'history-loading', loading: true});
    expect(s.loadingHistory).toBe(true);
  });
});

describe('state/derive.toChatMessage', () => {
  it('builds ChatMessage from Message', async () => {
    const {toChatMessage} = await import('../../src/state/derive.js');
    const m: Message = {
      id: 'm1',
      channel_id: 'c1',
      content: 'hi',
      author: {id: 'u1', username: 'me', discriminator: '0001'},
      timestamp: '2024-01-01T00:00:00.000Z',
    };
    const cm = toChatMessage(m, 'u1');
    expect(cm.id).toBe('m1');
    expect(cm.isMe).toBe(true);
    expect(cm.author).toBe('me');
  });
});
