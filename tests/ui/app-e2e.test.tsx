import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import React from 'react';
import {EventEmitter} from 'node:events';
import {render} from 'ink-testing-library';
import {Text} from 'ink';

// Mock session module to avoid writing to real config
vi.mock('../../src/session.ts', () => ({
  loadSession: () => ({updatedAt: 0}),
  saveChannel: () => {},
  saveDraft: () => {},
  clearDraft: () => {},
  flushDraft: () => {},
  clearSession: () => {},
  getSessionPath: () => '/dev/null',
}));

vi.mock('../../src/logger.ts', () => ({
  log: () => {},
  debug: () => {},
  enableVerbose: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  getLogPath: () => '/dev/null',
}));

import App from '../../src/app.tsx';

class MockClient extends EventEmitter {
  user: {id: string; username: string; global_name: string; discriminator: string} | null = null;
  guilds: Array<{id: string; name: string; channels: Array<{id: string; name: string; type: number}>}> = [];
  login = vi.fn(async () => {
    setTimeout(() => {
      this.user = {id: 'u1', username: 'me', discriminator: '0001', global_name: 'me'};
      this.guilds = [
        {id: 'g1', name: 'guild1', channels: [{id: 'c1', name: 'general', type: 0}]},
      ];
      this.emit('ready', {user: this.user, guilds: this.guilds});
    }, 50);
  });
  destroy = vi.fn(async () => {});
  sendMessage = vi.fn(async () => ({ok: true, message: null, queued: false} as never));
  fetchHistory = vi.fn(async () => []);
  getUser = () => this.user;
  getGuilds = () => this.guilds;
  getVoiceStatesForChannel = () => [];
  getQueueLength = () => 0;
}

describe('App E2E', () => {
  let client: MockClient;

  beforeEach(() => {
    client = new MockClient();
  });

  it('mounts and shows mode-select', async () => {
    const r = render(React.createElement(App, {client: client as never, noResume: true}));
    await new Promise(rr => setTimeout(rr, 100));
    const frame = r.lastFrame();
    console.log('frame:', JSON.stringify(frame));
    expect(frame).toContain('Selecciona modo');
    r.unmount();
  });

  it('normal mode: type and backspace in chat', async () => {
    const r = render(React.createElement(App, {client: client as never, noResume: true}));
    await new Promise(rr => setTimeout(rr, 200));

    // Pick "Normal" (default, just press Enter)
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));

    // Pick first guild
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));

    // Pick first channel
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));
    console.log('normal chat:', JSON.stringify(r.lastFrame()));

    // Type "hello"
    r.stdin.write('h');
    r.stdin.write('e');
    r.stdin.write('l');
    r.stdin.write('l');
    r.stdin.write('o');
    await new Promise(rr => setTimeout(rr, 50));
    const frame = r.lastFrame();
    console.log('after typing:', JSON.stringify(frame));
    expect(frame).toContain('›');
    expect(frame).toContain('hello');

    // Backspace
    r.stdin.write('\u0008');
    await new Promise(rr => setTimeout(rr, 50));
    const frame2 = r.lastFrame();
    console.log('after backspace:', JSON.stringify(frame2));
    expect(frame2).toContain('hell');

    // Enter to submit
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 50));
    const frame3 = r.lastFrame();
    console.log('after submit:', JSON.stringify(frame3));
    // Message appears in history with isMe styling ("me")
    expect(frame3).toContain('me');
    // Draft should be cleared — input row is empty (no text after the cursor)
    expect(frame3).toMatch(/›\s*\n/);
    r.unmount();
  });

  it('stealth chat: send a message and confirm no duplication', async () => {
    const r = render(React.createElement(App, {client: client as never, noResume: true}));
    await new Promise(rr => setTimeout(rr, 200));

    // Pick "Discreto" + Enter
    r.stdin.write('\x1b[B');
    await new Promise(rr => setTimeout(rr, 50));
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));

    // Pick first guild
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));

    // Pick first channel
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));

    // Type "hi"
    r.stdin.write('h');
    r.stdin.write('i');
    await new Promise(rr => setTimeout(rr, 50));

    // Submit
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 50));

    // Server confirms the message
    const realMessage = {
      id: 'real-1',
      channel_id: 'c1',
      content: 'hi',
      author: {id: 'u1', username: 'me', discriminator: '0001', global_name: 'me'},
      timestamp: new Date().toISOString(),
    };
    client.emit('message', realMessage);
    await new Promise(rr => setTimeout(rr, 100));

    const frame = r.lastFrame();
    console.log('after confirm:', JSON.stringify(frame));
    // Toggle history visible to verify message is in state
    r.stdin.write('\u0007');
    await new Promise(rr => setTimeout(rr, 100));
    const frame2 = r.lastFrame();
    console.log('after toggle history:', JSON.stringify(frame2));
    // "hi" should appear in the message line once (not in "historial" footer)
    const linesWithHi = frame2.split('\n').filter(l => /^\s*me\s+hi\s*$/.test(l));
    expect(linesWithHi).toHaveLength(1);
    r.unmount();
  });

  it('picks mode and navigates', async () => {
    const r = render(React.createElement(App, {client: client as never, noResume: true}));
    await new Promise(rr => setTimeout(rr, 200));
    console.log('initial:', JSON.stringify(r.lastFrame()));

    // Pick "Discreto" — second option, so down arrow + enter
    r.stdin.write('\x1b[B');
    await new Promise(rr => setTimeout(rr, 50));
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));
    console.log('after discreto:', JSON.stringify(r.lastFrame()));

    // Pick first guild (already selected, just press Enter)
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));
    console.log('after guild:', JSON.stringify(r.lastFrame()));

    // Pick first channel
    r.stdin.write('\r');
    await new Promise(rr => setTimeout(rr, 100));
    console.log('after channel:', JSON.stringify(r.lastFrame()));

    // Type "hello"
    r.stdin.write('h');
    r.stdin.write('e');
    r.stdin.write('l');
    r.stdin.write('l');
    r.stdin.write('o');
    await new Promise(rr => setTimeout(rr, 50));
    console.log('after typing:', JSON.stringify(r.lastFrame()));

    // Backspace
    r.stdin.write('\u0008');
    await new Promise(rr => setTimeout(rr, 50));
    console.log('after backspace:', JSON.stringify(r.lastFrame()));

    // Ctrl+G toggle history
    r.stdin.write('\u0007');
    await new Promise(rr => setTimeout(rr, 50));
    const frame = r.lastFrame();
    console.log('after ctrl+g:', JSON.stringify(frame));
    expect(frame).toContain('›');
    expect(frame).toContain('hell');
    expect(frame).toContain('cerrar historial');

    // Simulate MESSAGE_CREATE from server (the real one)
    const realMessage = {
      id: 'real-1',
      channel_id: 'c1',
      content: 'hell',
      author: {id: 'u1', username: 'me', discriminator: '0001', global_name: 'me'},
      timestamp: new Date().toISOString(),
    };
    client.emit('message', realMessage);
    await new Promise(rr => setTimeout(rr, 50));
    const frame2 = r.lastFrame();
    console.log('after server confirms:', JSON.stringify(frame2));
    expect(frame2).toContain('hell');
    expect(frame2).toContain('›');
    r.unmount();
  });
});
