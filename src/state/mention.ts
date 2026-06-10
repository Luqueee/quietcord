import type {AppState} from './machine.js';
import type {MentionResolver} from '../markdown/types.js';

export function makeMentionResolver(
  state: AppState
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
