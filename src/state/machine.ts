import type {Channel, Guild, Message, Snowflake, User, VoiceState} from '../domain/types.js';
import type {ChatMessage} from './types.js';

export type View =
  | 'mode-select'
  | 'guilds'
  | 'channels'
  | 'chat'
  | 'stealth-guilds'
  | 'stealth-channels';

export type Mode = 'normal' | 'stealth';

export type Status = 'connecting' | 'ready' | 'error';

export type AppState = {
  client: import('../discord.js').DiscordClient | null;
  status: Status;
  error: string | null;
  view: View;
  mode: Mode | null;
  historyVisible: boolean;
  loadingHistory: boolean;
  guilds: {label: string; value: string}[];
  channels: {label: string; value: string}[];
  currentGuild: Guild | null;
  currentChannel: Channel | null;
  messages: ChatMessage[];
  draft: string;
  selfId: Snowflake | null;
  selfName: string;
  voiceStates: VoiceState[];
  queueSize: number;
  unread: number;
};

export const initialAppState: AppState = {
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
  selfId: null,
  selfName: '',
  voiceStates: [],
  queueSize: 0,
  unread: 0,
};

export type Action =
  | {type: 'init'; client: import('../discord.js').DiscordClient}
  | {type: 'ready'; user: User; guilds: {label: string; value: string}[]}
  | {type: 'error'; error: string}
  | {type: 'pick-mode'; mode: Mode}
  | {type: 'enter-guild'; guild: Guild; channels: {label: string; value: string}[]}
  | {type: 'enter-channel'; channel: Channel}
  | {type: 'leave-channel'}
  | {type: 'go-to-guilds'}
  | {type: 'go-to-stealth-guilds'}
  | {type: 'go-to-stealth-channels'}
  | {type: 'go-to-mode-select'}
  | {type: 'history-loading'; loading: boolean}
  | {type: 'append-message'; message: ChatMessage}
  | {type: 'replace-message'; id: string; content: string; editedAt: number}
  | {type: 'delete-message'; id: string}
  | {type: 'set-draft'; draft: string}
  | {type: 'clear-draft'}
  | {type: 'draft-backspace'}
  | {type: 'toggle-history'}
  | {type: 'unread-increment'}
  | {type: 'unread-clear'}
  | {type: 'queue-update'; size: number}
  | {type: 'voice-update'; states: VoiceState[]}
  | {type: 'confirm-pending'; tempId: string; message: ChatMessage}
  | {type: 'guild-update'; guilds: {label: string; value: string}[]};

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'init':
      return {...state, client: action.client};
    case 'ready':
      return {
        ...state,
        status: 'ready',
        selfId: action.user.id,
        selfName: action.user.global_name || action.user.username,
        guilds: action.guilds,
      };
    case 'error':
      return {...state, status: 'error', error: action.error};
    case 'pick-mode':
      return {
        ...state,
        mode: action.mode,
        view: action.mode === 'normal' ? 'guilds' : 'stealth-guilds',
      };
    case 'enter-guild':
      return {
        ...state,
        currentGuild: action.guild,
        channels: action.channels,
        view: state.mode === 'stealth' ? 'stealth-channels' : 'channels',
      };
    case 'enter-channel':
      return {
        ...state,
        currentChannel: action.channel,
        view: 'chat',
        historyVisible: state.mode === 'stealth' ? false : state.historyVisible,
        messages: [],
        draft: '',
        unread: 0,
      };
    case 'leave-channel':
      return {
        ...state,
        currentChannel: null,
        messages: [],
        unread: 0,
        view: state.mode === 'stealth' ? 'stealth-channels' : 'channels',
      };
    case 'go-to-guilds':
      return {
        ...state,
        view: 'guilds',
        currentGuild: null,
        currentChannel: null,
        channels: [],
        messages: [],
        unread: 0,
      };
    case 'go-to-stealth-guilds':
      return {
        ...state,
        view: 'stealth-guilds',
        currentGuild: null,
        currentChannel: null,
        channels: [],
        messages: [],
        unread: 0,
      };
    case 'go-to-stealth-channels':
      return {
        ...state,
        view: 'stealth-channels',
        currentChannel: null,
        messages: [],
        unread: 0,
      };
    case 'go-to-mode-select':
      return {
        ...state,
        view: 'mode-select',
        mode: null,
        currentGuild: null,
        currentChannel: null,
        channels: [],
        messages: [],
        unread: 0,
      };
    case 'history-loading':
      return {...state, loadingHistory: action.loading};
    case 'append-message': {
      const exists = state.messages.some(m => m.id === action.message.id);
      const next = exists
        ? state.messages.map(m => (m.id === action.message.id ? action.message : m))
        : [...state.messages, action.message].slice(-MAX_MESSAGES);
      return {...state, messages: next};
    }
    case 'confirm-pending': {
      const idx = state.messages.findIndex(m => m.id === action.tempId);
      if (idx < 0) {
        const exists = state.messages.some(m => m.id === action.message.id);
        if (exists) return state;
        return {...state, messages: [...state.messages, action.message].slice(-MAX_MESSAGES)};
      }
      const next = state.messages.slice();
      next[idx] = action.message;
      return {...state, messages: next};
    }
    case 'replace-message':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.id ? {...m, content: action.content, editedAt: action.editedAt} : m
        ),
      };
    case 'delete-message':
      return {
        ...state,
        messages: state.messages.map(m => (m.id === action.id ? {...m, deleted: true} : m)),
      };
    case 'set-draft':
      return {...state, draft: action.draft};
    case 'clear-draft':
      return {...state, draft: ''};
    case 'draft-backspace':
      return {...state, draft: state.draft.slice(0, -1)};
    case 'toggle-history':
      return {...state, historyVisible: !state.historyVisible};
    case 'unread-increment':
      return {...state, unread: state.unread + 1};
    case 'unread-clear':
      return {...state, unread: 0};
    case 'queue-update':
      return {...state, queueSize: action.size};
    case 'voice-update':
      return {...state, voiceStates: action.states};
    case 'guild-update':
      return {...state, guilds: action.guilds};
  }
}

export const MAX_MESSAGES = 200;
