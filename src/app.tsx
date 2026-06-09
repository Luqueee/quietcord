import React, {useEffect, useState, useMemo, useRef, useCallback} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import {
  DiscordClient,
  Guild,
  Guild as GuildType,
  Message,
  Channel,
  VoiceState,
} from './discord.js';
import {
  State,
  Mode,
  GuildItem,
  ChannelItem,
  ChatMessage,
  initialState,
  buildGuildList,
  buildChannelList,
  toChatMessage,
  makeMentionResolver,
} from './state.js';
import {log} from './logger.js';
import {loadSession, saveChannel, saveDraft, clearDraft} from './session.js';

type Props = {token: string; showHints: boolean; noResume?: boolean};

const MAX_MESSAGES = 200;
const VISIBLE_MESSAGES = 14;
const SILENT_RECONNECT_THRESHOLD = 3;
const STATUS_FLASH_MS = 4000;

export default function App({token, showHints, noResume}: Props) {
  const {exit} = useApp();
  const [state, setState] = useState<State>(initialState);
  const silentErrorsRef = useRef(0);
  const [statusFlash, setStatusFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientRef = useRef<DiscordClient | null>(null);
  const sessionRef = useRef(loadSession());

  useEffect(() => {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?25l');
      return () => {
        process.stdout.write('\x1b[?25h');
      };
    }
    return undefined;
  }, []);

  const flash = useCallback((msg: string) => {
    setStatusFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setStatusFlash(null), STATUS_FLASH_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const client = new DiscordClient(token);
    clientRef.current = client;

    const onReady = ({guilds}: {user: {id: string}; guilds: Guild[]}) => {
      if (cancelled) return;
      log('app: ready, guilds=', guilds.length);
      silentErrorsRef.current = 0;

      const session = noResume ? {updatedAt: 0} : sessionRef.current;
      let view: State['view'] = 'mode-select';
      let currentGuild: Guild | null = null;
      let currentChannel: Channel | null = null;
      let restoredDraft = '';

      if (session.guildId) {
        const guild = guilds.find(g => g.id === session.guildId) ?? null;
        if (guild) {
          currentGuild = guild;
          if (session.channelId) {
            const channel = guild.channels.find(c => c.id === session.channelId);
            if (channel && (channel.type === 0 || channel.type === 2 || channel.type === 5 || channel.type === 13)) {
              currentChannel = channel;
              view = 'chat';
              if (session.draft) restoredDraft = session.draft;
            } else {
              view = 'channels';
            }
          } else {
            view = 'channels';
          }
        }
      }

      setState(s => ({
        ...s,
        client,
        status: 'ready',
        guilds: buildGuildList(guilds),
        view: s.view === 'mode-select' ? 'mode-select' : view,
        currentGuild,
        currentChannel,
        messages: currentChannel ? s.messages : [],
        draft: restoredDraft || s.draft,
      }));
    };

    const onMessage = (m: Message) => {
      if (cancelled) return;
      setState(s => {
        if (!s.currentChannel || s.currentChannel.id !== m.channel_id) {
          if (s.currentChannel && s.currentChannel.id !== m.channel_id) {
            return {...s, unread: s.unread + 1};
          }
          return s;
        }
        const selfId = s.client?.getUser()?.id;
        const cm = toChatMessage(m, selfId);
        if (s.messages.some(x => x.id === cm.id)) return s;
        const optimisticIdx = s.messages.findIndex(
          x =>
            x.id.startsWith('pending-') &&
            x.isMe &&
            x.content === cm.content &&
            Math.abs(x.ts - cm.ts) < 60000
        );
        if (optimisticIdx >= 0) {
          const next = s.messages.slice();
          next[optimisticIdx] = cm;
          return {...s, messages: next};
        }
        return {...s, messages: [...s.messages, cm].slice(-MAX_MESSAGES)};
      });
    };

    const onMessageUpdate = (m: Message) => {
      if (cancelled) return;
      setState(s => {
        if (!s.currentChannel || s.currentChannel.id !== m.channel_id) return s;
        return {
          ...s,
          messages: s.messages.map(x =>
            x.id === m.id
              ? {
                  ...x,
                  content: m.content,
                  editedAt: m.edited_timestamp ? Date.parse(m.edited_timestamp) : undefined,
                }
              : x
          ),
        };
      });
    };

    const onMessageDelete = (d: {id: string; channel_id: string}) => {
      if (cancelled) return;
      setState(s => {
        if (!s.currentChannel || s.currentChannel.id !== d.channel_id) return s;
        return {
          ...s,
          messages: s.messages.map(x => (x.id === d.id ? {...x, deleted: true, content: ''} : x)),
        };
      });
    };

    const onVoiceState = (_vs: VoiceState) => {
      if (cancelled) return;
      setState(s => {
        if (!s.client || !s.currentChannel) return s;
        return {
          ...s,
          voiceStates: s.client.getVoiceStatesForChannel(s.currentChannel.id),
        };
      });
    };

    const onQueueUpdate = (size: number) => {
      if (cancelled) return;
      setState(s => ({...s, queueSize: size}));
      if (size === 0) flash('flushed');
      else flash(`queued: ${size}`);
    };

    const onMessageSent = (m: Message) => {
      if (cancelled) return;
      setState(s => {
        if (!s.currentChannel || s.currentChannel.id !== m.channel_id) return s;
        const selfId = s.client?.getUser()?.id;
        const cm = toChatMessage(m, selfId);
        if (s.messages.some(x => x.id === cm.id)) return {...s, draft: ''};
        const optimisticIdx = s.messages.findIndex(
          x =>
            x.id.startsWith('pending-') &&
            x.isMe &&
            x.content === cm.content &&
            Math.abs(x.ts - cm.ts) < 60000
        );
        if (optimisticIdx >= 0) {
          const next = s.messages.slice();
          next[optimisticIdx] = cm;
          return {...s, messages: next, draft: ''};
        }
        return {...s, messages: [...s.messages, cm].slice(-MAX_MESSAGES), draft: ''};
      });
      clearDraft();
    };

    const onSendFailed = (info: {channelId: string; content: string; reason: string}) => {
      flash(`send failed: ${info.reason}`);
    };

    const onError = (_err: Error) => {
      if (cancelled) return;
      silentErrorsRef.current += 1;
      if (silentErrorsRef.current >= SILENT_RECONNECT_THRESHOLD) {
        setState(s => ({...s, status: 'error', error: 'connection lost'}));
      } else {
        flash('reconnecting…');
      }
    };

    client.on('ready', onReady);
    client.on('message', onMessage);
    client.on('messageUpdate', onMessageUpdate);
    client.on('messageDelete', onMessageDelete);
    client.on('voiceStateUpdate', onVoiceState);
    client.on('queueUpdate', onQueueUpdate);
    client.on('messageSent', onMessageSent);
    client.on('sendFailed', onSendFailed);
    client.on('error', onError);

    client.login().catch((err: Error) => {
      if (cancelled) return;
      setState(s => ({...s, status: 'error', error: err.message}));
    });

    return () => {
      cancelled = true;
      client.off('ready', onReady);
      client.off('message', onMessage);
      client.off('messageUpdate', onMessageUpdate);
      client.off('messageDelete', onMessageDelete);
      client.off('voiceStateUpdate', onVoiceState);
      client.off('queueUpdate', onQueueUpdate);
      client.off('messageSent', onMessageSent);
      client.off('sendFailed', onSendFailed);
      client.off('error', onError);
      void client.destroy();
    };
  }, [token, noResume, flash]);

  useEffect(() => {
    const {currentChannel, client} = state;
    if (!client || !currentChannel) return;

    let cancelled = false;
    log('app: fetching history for', currentChannel.id);
    setState(s => ({...s, messages: [], loadingHistory: true}));
    client
      .fetchHistory(currentChannel.id, 50)
      .then(msgs => {
        if (cancelled) return;
        log('app: history got', msgs.length, 'messages');
        setState(s => {
          const selfId = s.client?.getUser()?.id;
          const history = msgs.map(m => toChatMessage(m, selfId)).sort((a, b) => a.ts - b.ts);
          return {...s, messages: history.slice(-MAX_MESSAGES), loadingHistory: false};
        });
      })
      .catch(err => {
        log('app: history failed', err.message);
        if (!cancelled) {
          setState(s => ({...s, loadingHistory: false}));
        }
      });

    setState(s => ({...s, voiceStates: client.getVoiceStatesForChannel(currentChannel.id)}));

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
    if (state.mode === 'stealth') {
      if (key.ctrl && input === 'g') {
        setState(s => ({...s, historyVisible: !s.historyVisible}));
        return;
      }
      if (state.view === 'stealth-guilds' && key.escape) {
        setState(s => ({...s, view: 'mode-select', mode: null, currentGuild: null, currentChannel: null}));
        return;
      }
      if (state.view === 'stealth-channels' && key.escape) {
        setState(s => ({...s, view: 'stealth-guilds', currentGuild: null, channels: []}));
        return;
      }
      if (state.view === 'chat') {
        if (state.historyVisible && key.escape) {
          setState(s => ({...s, historyVisible: false}));
          return;
        }
        if (!state.historyVisible) {
          if (key.return) {
            const content = state.draft.trim();
            if (content && state.currentChannel) {
              void sendMessage(state, setState, clientRef.current);
            }
            return;
          }
          if (key.meta) {
            return;
          }
          if (key.backspace || key.delete) {
            if (state.draft.length > 0) {
              const next = state.draft.slice(0, -1);
              setState(s => ({...s, draft: next}));
              if (next) saveDraft(next);
            }
            return;
          }
          if (key.ctrl || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
            return;
          }
          if (input) {
            const next = state.draft + input;
            setState(s => ({...s, draft: next}));
            saveDraft(next);
            return;
          }
          if (key.escape) {
            setState(s => ({
              ...s,
              view: 'stealth-channels',
              currentChannel: null,
              messages: [],
              unread: 0,
            }));
            return;
          }
        }
        return;
      }
      return;
    }
    if (state.view === 'chat' && key.escape) {
      setState(s => ({...s, view: 'channels', currentChannel: null, messages: [], unread: 0}));
    } else if (state.view === 'channels' && key.escape) {
      setState(s => ({...s, view: 'guilds', currentGuild: null, channels: []}));
    } else if (state.view === 'guilds' && key.escape) {
      setState(s => ({...s, view: 'mode-select', mode: null}));
    } else if (state.view === 'mode-select' && key.escape) {
      exit();
    }
  });

  if (state.status === 'error') {
    return (
      <Box paddingX={1}>
        <Text color="red">{state.error}</Text>
      </Box>
    );
  }

  const body = (() => {
    if (state.status === 'connecting') {
      return <Text dimColor> </Text>;
    }
    if (state.view === 'mode-select') {
      return (
        <ModeSelect
          onSelect={m => {
            setState(s => {
              if (m === 'normal') {
                return {...s, mode: 'normal', view: 'guilds'};
              }
              return {...s, mode: 'stealth', view: 'stealth-guilds'};
            });
          }}
        />
      );
    }
    if (state.mode === 'stealth') {
      if (state.view === 'stealth-guilds') {
        return (
          <StealthPicker
            title="Servidor:"
            items={state.guilds}
            onSelect={item => enterGuildStealth(item, setState)}
          />
        );
      }
      if (state.view === 'stealth-channels') {
        return (
          <StealthPicker
            title="Canal:"
            items={state.channels}
            onSelect={item => enterChannelStealth(item, setState)}
          />
        );
      }
      if (state.historyVisible) {
        return (
          <StealthChatView
            channel={state.currentChannel as Channel}
            messages={state.messages}
            draft={state.draft}
            statusFlash={statusFlash}
            queueSize={state.queueSize}
            unread={state.unread}
            loadingHistory={state.loadingHistory}
          />
        );
      }
      return (
        <StealthInput
          channel={state.currentChannel as Channel}
          draft={state.draft}
        />
      );
    }
    if (state.view === 'guilds') {
      return (
        <GuildsView
          guilds={state.guilds}
          onSelect={item => enterGuild(item, setState)}
        />
      );
    }
    if (state.view === 'channels') {
      return (
        <ChannelsView
          guild={state.currentGuild as GuildType}
          channels={state.channels}
          onSelect={item => enterChannel(item, setState)}
          onBack={() =>
            setState(s => ({...s, view: 'guilds', currentGuild: null, channels: []}))
          }
        />
      );
    }
    return (
      <ChatView
        channel={state.currentChannel as Channel}
        messages={state.messages}
        draft={state.draft}
        setDraft={v => {
          setState(s => ({...s, draft: v}));
          if (v) saveDraft(v);
        }}
        onSubmit={() => sendMessage(state, setState, clientRef.current)}
        statusFlash={statusFlash}
        voiceStates={state.voiceStates}
        queueSize={state.queueSize}
        unread={state.unread}
        resolver={makeMentionResolver(state)}
        loadingHistory={state.loadingHistory}
      />
    );
  })();

  return (
    <Box flexDirection="column" paddingX={1}>
      {body}
      {showHints ? <Hints view={state.view} /> : null}
    </Box>
  );
}

function Hints({view}: {view: State['view']}) {
  const text =
    view === 'chat'
      ? 'enter send · esc back · ctrl+c quit'
      : view === 'channels'
      ? '↑/↓ navigate · enter select · esc back · ctrl+c quit'
      : '↑/↓ navigate · enter select · esc back · ctrl+c quit';
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

function ModeSelect({onSelect}: {onSelect: (m: Mode) => void}) {
  const items = [
    {label: 'Normal', value: 'normal' as Mode},
    {label: 'Discreto', value: 'stealth' as Mode},
  ];
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Selecciona modo:</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={item => onSelect(item.value)} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>discreto: solo input · ctrl+g historial · esc cambiar canal</Text>
      </Box>
    </Box>
  );
}

function StealthInput({
  channel,
  draft,
}: {
  channel: Channel;
  draft: string;
}) {
  return (
    <Box>
      <Text color="green">› </Text>
      <Text inverse> </Text>
      {draft ? <Text>{draft}</Text> : null}
    </Box>
  );
}

function StealthChatView({
  channel,
  messages,
  draft,
  statusFlash,
  queueSize,
  unread,
  loadingHistory,
}: {
  channel: Channel;
  messages: ChatMessage[];
  draft: string;
  statusFlash: string | null;
  queueSize: number;
  unread: number;
  loadingHistory?: boolean;
}) {
  const visible = useMemo(() => messages.slice(-VISIBLE_MESSAGES), [messages]);
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={VISIBLE_MESSAGES} overflow="hidden" flexShrink={0}>
        {visible.map(m => (
          <Box key={m.id} flexDirection="row">
            <Text color={m.isMe ? 'green' : 'cyan'}>
              {(m.author || '???').slice(0, 12).padEnd(12)}{' '}
            </Text>
            <Text>
              {m.deleted ? '[deleted]' : (m.content || '').replace(/\n/g, ' ')}
              {m.editedAt ? ' (edited)' : ''}
            </Text>
          </Box>
        ))}
        {messages.length === 0 ? (
          <Text dimColor>{loadingHistory ? 'cargando historial…' : ' '}</Text>
        ) : null}
      </Box>
      <Box>
        <Text color="green">› </Text>
        <Text inverse> </Text>
        {draft ? <Text>{draft}</Text> : null}
      </Box>
      <Box>
        <Text dimColor>
          {(statusFlash ?? ' ').padEnd(40)}
          {queueSize > 0 ? ` queued:${queueSize}` : ''}
          {unread > 0 ? ` ●${unread}` : ''}
        </Text>
      </Box>
      <Text dimColor>#{channel.name}</Text>
    </Box>
  );
}

function StealthPicker({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: Array<{label: string; value: string}>;
  onSelect: (item: {label: string; value: string}) => void;
}) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>{title}</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={onSelect} limit={15} />
      </Box>
    </Box>
  );
}

function enterGuild(item: GuildItem, setState: React.Dispatch<React.SetStateAction<State>>) {
  setState(s => {
    if (!s.client) return s;
    const guild = s.client.getGuilds().find(g => g.id === item.value);
    if (!guild) return s;
    return {
      ...s,
      currentGuild: guild,
      channels: buildChannelList(guild),
      view: 'channels',
    };
  });
}

function enterChannel(item: ChannelItem, setState: React.Dispatch<React.SetStateAction<State>>) {
  setState(s => {
    if (!s.client || !s.currentGuild) return s;
    const channel = s.currentGuild.channels.find(c => c.id === item.value);
    if (!channel) return s;
    saveChannel(s.currentGuild.id, channel.id);
    return {
      ...s,
      currentChannel: channel,
      view: 'chat',
      messages: [],
      draft: '',
      unread: 0,
    };
  });
}

function enterGuildStealth(item: GuildItem, setState: React.Dispatch<React.SetStateAction<State>>) {
  setState(s => {
    if (!s.client) return s;
    const guild = s.client.getGuilds().find(g => g.id === item.value);
    if (!guild) return s;
    return {
      ...s,
      currentGuild: guild,
      channels: buildChannelList(guild),
      view: 'stealth-channels',
    };
  });
}

function enterChannelStealth(item: ChannelItem, setState: React.Dispatch<React.SetStateAction<State>>) {
  setState(s => {
    if (!s.client || !s.currentGuild) return s;
    const channel = s.currentGuild.channels.find(c => c.id === item.value);
    if (!channel) return s;
    saveChannel(s.currentGuild.id, channel.id);
    const sameChannel = s.currentChannel?.id === channel.id;
    return {
      ...s,
      currentChannel: channel,
      view: 'chat',
      historyVisible: false,
      draft: '',
      unread: 0,
    };
  });
}

async function sendMessage(
  state: State,
  setState: React.Dispatch<React.SetStateAction<State>>,
  client: DiscordClient | null
) {
  const {currentChannel, draft} = state;
  const content = draft.trim();
  if (!currentChannel || !content || !client) return;
  if (content.length > 2000) return;

  const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const optimistic: ChatMessage = {
    id: optimisticId,
    author: state.client?.getUser()?.global_name || state.client?.getUser()?.username || 'me',
    authorId: state.client?.getUser()?.id || '',
    content,
    isMe: true,
    ts: Date.now(),
  };
  setState(s => ({
    ...s,
    messages: [
      ...s.messages.filter(m => !(m.id.startsWith('pending-') && m.content === content)),
      optimistic,
    ].slice(-MAX_MESSAGES),
    draft: '',
  }));
  clearDraft();

  const result = await client.sendMessage(currentChannel.id, content);
  if (!result.ok) {
    setState(s => ({...s, messages: s.messages.filter(m => m.id !== optimisticId)}));
  }
}

function GuildsView({
  guilds,
  onSelect,
}: {
  guilds: GuildItem[];
  onSelect: (item: GuildItem) => void;
}) {
  return (
    <Box flexDirection="column">
      <SelectInput items={guilds} onSelect={onSelect} limit={15} />
    </Box>
  );
}

function ChannelsView({
  guild,
  channels,
  onSelect,
  onBack,
}: {
  guild: GuildType;
  channels: ChannelItem[];
  onSelect: (item: ChannelItem) => void;
  onBack: () => void;
}) {
  useInput((_, key) => {
    if (key.escape) onBack();
  });
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text dimColor>{guild.name}</Text>
      </Box>
      <SelectInput items={channels} onSelect={onSelect} limit={15} />
    </Box>
  );
}

function ChatView({
  channel,
  messages,
  draft,
  setDraft,
  onSubmit,
  statusFlash,
  voiceStates,
  queueSize,
  unread,
  resolver,
  loadingHistory,
}: {
  channel: Channel;
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  statusFlash: string | null;
  voiceStates: VoiceState[];
  queueSize: number;
  unread: number;
  resolver: ReturnType<typeof makeMentionResolver>;
  loadingHistory?: boolean;
}) {
  const visible = useMemo(() => messages.slice(-VISIBLE_MESSAGES), [messages]);
  const inVoice = voiceStates.length > 0;
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={VISIBLE_MESSAGES} overflow="hidden" flexShrink={0}>
        {visible.map(m => (
          <Box key={m.id} flexDirection="row">
            <Text color={m.isMe ? 'green' : 'cyan'}>
              {(m.author || '???').slice(0, 12).padEnd(12)}{' '}
            </Text>
            <Text>
              {m.deleted ? '[deleted]' : (m.content || '').replace(/\n/g, ' ')}
              {m.editedAt ? ' (edited)' : ''}
            </Text>
          </Box>
        ))}
        {messages.length === 0 ? (
          <Text dimColor>{loadingHistory ? 'cargando historial…' : ' '}</Text>
        ) : null}
      </Box>
      <Box>
        <Text color="green">› </Text>
        <TextInput value={draft} onChange={setDraft} onSubmit={onSubmit} />
      </Box>
      <Box>
        <Text dimColor>
          {(statusFlash ?? ' ').padEnd(40)}
          {queueSize > 0 ? ` queued:${queueSize}` : ''}
          {inVoice ? ` in-voice:${voiceStates.length}` : ''}
          {unread > 0 ? ` ●${unread}` : ''}
        </Text>
      </Box>
      <Text dimColor>
        #{channel.name}
        {unread > 0 ? <Text color="yellow"> ●{unread}</Text> : null}
      </Text>
    </Box>
  );
}
