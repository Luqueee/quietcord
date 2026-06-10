import React, {useCallback, useContext, useEffect, useReducer, useRef, createContext} from 'react';
import {useApp as useInkApp, useInput, Text, Box} from 'ink';
import {DiscordClient, type Channel, type Guild, type Message, type User, type VoiceState} from './discord.js';
import {reduce, initialAppState, type AppState, type Action, MAX_MESSAGES} from './state/machine.js';
import {toChatMessage} from './state/derive.js';
import {buildGuildList, buildChannelList, findChannel} from './state/selectors.js';
import {log} from './logger.js';
import {loadSession, saveChannel} from './session.js';
import {saveDraft as persistDraft, clearDraft as persistClearDraft} from './state/draft.js';
import {useTerminalCursor} from './ui/hooks/useTerminalCursor.js';
import {Router} from './router.js';
import {ClientProvider} from './provider.js';
import type {ChatMessage} from './state/types.js';

type Props = {client: DiscordClient; noResume?: boolean};

const SILENT_RECONNECT_THRESHOLD = 3;

type AppCtx = {state: AppState; dispatch: React.Dispatch<Action>};
const Ctx = createContext<AppCtx | null>(null);

export function useAppState(): {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onSelectGuild: (item: {label: string; value: string}) => void;
  onSelectChannel: (item: {label: string; value: string}) => void;
} {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within App');
  const {state, dispatch} = ctx;
  const onSelectGuild = useCallback(
    (item: {label: string; value: string}) => {
      const guild = state.client?.getGuilds().find(g => g.id === item.value) ?? null;
      if (!guild) return;
      dispatch({type: 'enter-guild', guild, channels: buildChannelList(guild)});
    },
    [state.client, dispatch]
  );
  const onSelectChannel = useCallback(
    (item: {label: string; value: string}) => {
      if (!state.currentGuild) return;
      const channel = findChannel(state.currentGuild, item.value);
      if (!channel) return;
      saveChannel(state.currentGuild.id, channel.id);
      dispatch({type: 'enter-channel', channel});
    },
    [state.currentGuild, dispatch]
  );
  return {state, dispatch, onSelectGuild, onSelectChannel};
}

export default function App({client, noResume = false}: Props) {
  return (
    <ClientProvider client={client}>
      <Shell client={client} noResume={noResume} />
    </ClientProvider>
  );
}

function Shell({client, noResume}: Props) {
  const {exit} = useInkApp();
  const [state, dispatch] = useReducer(reduce, initialAppState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const silentErrorsRef = useRef(0);

  useTerminalCursor();

  useEffect(() => {
    let cancelled = false;
    dispatch({type: 'init', client});

    const onReady = ({user, guilds}: {user: User; guilds: Guild[]}): void => {
      if (cancelled) return;
      const available = guilds.filter((g): g is Guild & {name: string} => typeof g.name === 'string');
      log('app: ready, guilds=', available.length, 'of', guilds.length);
      silentErrorsRef.current = 0;
      dispatch({type: 'ready', user, guilds: buildGuildList(available)});

      const session = noResume ? {updatedAt: 0} : loadSession();
      if (!session.guildId) return;
      const guild = guilds.find(g => g.id === session.guildId) ?? null;
      if (!guild) return;
      dispatch({type: 'enter-guild', guild, channels: buildChannelList(guild)});
      if (!session.channelId) return;
      const c = guild.channels.find(ch => ch.id === session.channelId);
      if (!c) return;
      if (!(c.type === 0 || c.type === 2 || c.type === 5 || c.type === 13)) return;
      dispatch({type: 'enter-channel', channel: c});
      if (session.draft) {
        dispatch({type: 'set-draft', draft: session.draft});
      }
    };

    const onMessage = (m: Message): void => {
      if (cancelled) return;
      const s = stateRef.current;
      const selfId = client.getUser()?.id;
      const cm = toChatMessage(m, selfId);
      if (!s.currentChannel || s.currentChannel.id !== m.channel_id) {
        if (s.currentChannel && s.currentChannel.id !== m.channel_id) {
          dispatch({type: 'unread-increment'});
        }
        return;
      }
      const pending = s.messages.find(
        x =>
          x.id.startsWith('pending-') &&
          x.isMe &&
          x.content === cm.content &&
          Math.abs(x.ts - cm.ts) < 60000
      );
      if (pending) {
        dispatch({type: 'confirm-pending', tempId: pending.id, message: cm});
      } else {
        dispatch({type: 'append-message', message: cm});
      }
    };

    const onMessageUpdate = (m: Message): void => {
      if (cancelled) return;
      const s = stateRef.current;
      if (!s.currentChannel || s.currentChannel.id !== m.channel_id) return;
      dispatch({
        type: 'replace-message',
        id: m.id,
        content: m.content,
        editedAt: m.edited_timestamp ? Date.parse(m.edited_timestamp) : 0,
      });
    };

    const onMessageDelete = (d: {id: string; channel_id: string}): void => {
      if (cancelled) return;
      const s = stateRef.current;
      if (!s.currentChannel || s.currentChannel.id !== d.channel_id) return;
      dispatch({type: 'delete-message', id: d.id});
    };

    const onVoiceState = (_vs: VoiceState): void => {
      if (cancelled) return;
      const s = stateRef.current;
      if (!s.client || !s.currentChannel) return;
      dispatch({type: 'voice-update', states: s.client.getVoiceStatesForChannel(s.currentChannel.id)});
    };

    const onQueueUpdate = (size: number): void => {
      if (cancelled) return;
      dispatch({type: 'queue-update', size});
    };

    const onGuildUpdate = (g: Guild): void => {
      if (cancelled) return;
      if (typeof g.name !== 'string') return;
      const list = buildGuildList(client.getGuilds().filter((x): x is Guild & {name: string} => typeof x.name === 'string'));
      dispatch({type: 'guild-update', guilds: list});
    };

    const onMessageSent = (m: Message): void => {
      if (cancelled) return;
      const s = stateRef.current;
      if (!s.currentChannel || s.currentChannel.id !== m.channel_id) return;
      const selfId = client.getUser()?.id;
      const cm = toChatMessage(m, selfId);
      const pending = s.messages.find(
        x =>
          x.id.startsWith('pending-') &&
          x.isMe &&
          x.content === cm.content &&
          Math.abs(x.ts - cm.ts) < 60000
      );
      if (pending) {
        dispatch({type: 'confirm-pending', tempId: pending.id, message: cm});
      } else {
        dispatch({type: 'append-message', message: cm});
      }
      dispatch({type: 'clear-draft'});
      persistClearDraft();
    };

    const onError = (_err: Error): void => {
      if (cancelled) return;
      silentErrorsRef.current += 1;
      if (silentErrorsRef.current >= SILENT_RECONNECT_THRESHOLD) {
        dispatch({type: 'error', error: 'connection lost'});
      }
    };

    client.on('ready', onReady);
    client.on('message', onMessage);
    client.on('messageUpdate', onMessageUpdate);
    client.on('messageDelete', onMessageDelete);
    client.on('voiceStateUpdate', onVoiceState);
    client.on('guildUpdate', onGuildUpdate);
    client.on('queueUpdate', onQueueUpdate);
    client.on('messageSent', onMessageSent);
    client.on('error', onError);

    client.login().catch((err: Error) => {
      if (cancelled) return;
      dispatch({type: 'error', error: err.message});
    });

    return () => {
      cancelled = true;
      client.off('ready', onReady);
      client.off('message', onMessage);
      client.off('messageUpdate', onMessageUpdate);
      client.off('messageDelete', onMessageDelete);
      client.off('voiceStateUpdate', onVoiceState);
      client.off('guildUpdate', onGuildUpdate);
      client.off('queueUpdate', onQueueUpdate);
      client.off('messageSent', onMessageSent);
      client.off('error', onError);
      void client.destroy();
    };
  }, [client, noResume]);

  useEffect(() => {
    const channel = state.currentChannel;
    const cl = state.client;
    if (!cl || !channel) return;
    let cancelled = false;
    log('app: fetching history for', channel.id);
    dispatch({type: 'history-loading', loading: true});
    cl
      .fetchHistory(channel.id, 50)
      .then(msgs => {
        if (cancelled) return;
        log('app: history got', msgs.length, 'messages');
        const selfId = cl.getUser()?.id;
        const history = msgs.map(m => toChatMessage(m, selfId)).sort((a, b) => a.ts - b.ts);
        for (const m of history.slice(-MAX_MESSAGES)) {
          dispatch({type: 'append-message', message: m});
        }
        dispatch({type: 'history-loading', loading: false});
      })
      .catch(err => {
        log('app: history failed', err.message);
        if (!cancelled) {
          dispatch({type: 'history-loading', loading: false});
        }
      });

    dispatch({type: 'voice-update', states: cl.getVoiceStatesForChannel(channel.id)});

    return () => {
      cancelled = true;
    };
  }, [state.currentChannel, state.client]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (state.status === 'error') {
      exit();
      return;
    }

    if (state.view === 'chat') {
      if (key.ctrl && input === 'g') {
        dispatch({type: 'toggle-history'});
        return;
      }
      if (key.escape) {
        if (state.historyVisible) {
          dispatch({type: 'toggle-history'});
        } else {
          dispatch({type: 'leave-channel'});
        }
        return;
      }
      if (state.historyVisible) {
        return;
      }
      if (key.return) {
        const content = state.draft.trim();
        if (content && state.currentChannel) {
          void sendMessage(dispatch, state, client);
        }
        return;
      }
      if (key.backspace || key.delete) {
        if (state.draft.length > 0) {
          dispatch({type: 'draft-backspace'});
          const next = state.draft.slice(0, -1);
          if (next) persistDraft(next);
          else persistClearDraft();
        }
        return;
      }
      if (key.ctrl || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        return;
      }
      if (input) {
        const next = state.draft + input;
        dispatch({type: 'set-draft', draft: next});
        persistDraft(next);
        return;
      }
      return;
    }

    if (key.escape) {
      if (state.mode === 'stealth') {
        if (state.view === 'stealth-guilds') {
          dispatch({type: 'go-to-mode-select'});
        } else if (state.view === 'stealth-channels') {
          dispatch({type: 'go-to-stealth-guilds'});
        }
      } else {
        if (state.view === 'channels') {
          dispatch({type: 'go-to-guilds'});
        } else if (state.view === 'guilds') {
          dispatch({type: 'go-to-mode-select'});
        } else if (state.view === 'mode-select') {
          exit();
        }
      }
      return;
    }
  });

  if (state.status === 'error') {
    return (
      <Box paddingX={1}>
        <Text color="red">{state.error ?? 'error'}</Text>
      </Box>
    );
  }

  return (
    <Ctx.Provider value={{state, dispatch}}>
      <Router />
    </Ctx.Provider>
  );
}

async function sendMessage(
  dispatch: React.Dispatch<Action>,
  state: AppState,
  client: DiscordClient
): Promise<void> {
  const {currentChannel, draft} = state;
  const content = draft.trim();
  if (!currentChannel || !content || !client) return;
  if (content.length > 2000) return;

  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const me = client.getUser();
  const optimistic: ChatMessage = {
    id: optimisticId,
    author: me?.global_name || me?.username || 'me',
    authorId: me?.id || '',
    content,
    isMe: true,
    ts: Date.now(),
  };
  dispatch({type: 'append-message', message: optimistic});
  dispatch({type: 'clear-draft'});
  persistClearDraft();

  const result = await client.sendMessage(currentChannel.id, content);
  if (!result.ok) {
    dispatch({type: 'delete-message', id: optimisticId});
  }
}
