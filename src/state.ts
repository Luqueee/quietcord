import {Channel, Guild, Message, DiscordClient, ChannelKind, VoiceState} from './discord.js';
import {MentionResolver} from './markdown.js';

export type View = 'mode-select' | 'guilds' | 'channels' | 'chat' | 'stealth-guilds' | 'stealth-channels';

export type Mode = 'normal' | 'stealth';

export type GuildItem = {label: string; value: string};
export type ChannelItem = {label: string; value: string};

export type ChatMessage = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  isMe: boolean;
  ts: number;
  editedAt?: number;
  deleted?: boolean;
};

export type State = {
  client: DiscordClient | null;
  status: 'connecting' | 'ready' | 'error';
  error: string | null;
  view: View;
  mode: Mode | null;
  historyVisible: boolean;
  loadingHistory: boolean;
  guilds: GuildItem[];
  channels: ChannelItem[];
  currentGuild: Guild | null;
  currentChannel: Channel | null;
  messages: ChatMessage[];
  draft: string;
  voiceStates: VoiceState[];
  queueSize: number;
  unread: number;
};

export const initialState: State = {
  client: null,
  status: 'connecting',
  error: null,
  view: 'mode-select',
  mode: null,
  historyVisible: false,
  loadingHistory: false,
  guilds: [],
  channels: [],
  currentGuild: null,
  currentChannel: null,
  messages: [],
  draft: '',
  voiceStates: [],
  queueSize: 0,
  unread: 0,
};

export function buildGuildList(guilds: Guild[]): GuildItem[] {
  return guilds
    .map(g => ({label: g.name, value: g.id}))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildChannelList(guild: Guild): ChannelItem[] {
  return guild.channels
    .filter(c => ChannelKind.isTextType(c.type) || ChannelKind.isVoiceType(c.type))
    .map(c => ({
      label: `${ChannelKind.isVoiceType(c.type) ? '🔊' : '#'} ${c.name}`,
      value: c.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function toChatMessage(message: Message, selfId?: string): ChatMessage {
  return {
    id: message.id,
    author: message.author.global_name || message.author.username,
    authorId: message.author.id,
    content: message.content,
    isMe: selfId ? message.author.id === selfId : false,
    ts: Date.parse(message.timestamp) || Date.now(),
    editedAt: message.edited_timestamp ? Date.parse(message.edited_timestamp) : undefined,
  };
}

export function makeMentionResolver(
  state: State
): MentionResolver & {getVoiceMembers: () => {id: string; name: string}[]} {
  return {
    resolveUser: id => {
      for (const g of state.client?.getGuilds() ?? []) {
        for (const vs of state.client?.getVoiceStatesForChannel(g.id) ?? []) {
          if (vs.user_id === id) return vs.member?.user?.global_name || vs.member?.user?.username || null;
        }
      }
      return state.client?.getUser()?.id === id ? state.client.getUser()?.global_name || state.client.getUser()?.username || null : null;
    },
    resolveChannel: id => {
      for (const g of state.client?.getGuilds() ?? []) {
        const c = g.channels.find(c => c.id === id);
        if (c) return c.name;
      }
      return null;
    },
    getVoiceMembers: () => {
      if (!state.client || !state.currentChannel) return [];
      return state.client.getVoiceStatesForChannel(state.currentChannel.id).map(vs => ({
        id: vs.user_id,
        name: vs.member?.user?.global_name || vs.member?.user?.username || vs.user_id,
      }));
    },
  };
}
