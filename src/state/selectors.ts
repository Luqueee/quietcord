import {ChannelKind, type Channel, type Guild} from '../domain/types.js';
import type {ChatMessage} from './types.js';

export type GuildItem = {label: string; value: string};
export type ChannelItem = {label: string; value: string};

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

export function findChannel(guild: Guild, id: string): Channel | null {
  return guild.channels.find(c => c.id === id) ?? null;
}
