export type Snowflake = string;

export type User = {
  id: Snowflake;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type Channel = {
  id: Snowflake;
  name: string;
  type: number;
  guild_id?: Snowflake;
  parent_id?: Snowflake | null;
  position?: number;
};

export type VoiceState = {
  user_id: Snowflake;
  channel_id?: Snowflake | null;
  member?: {
    user?: User;
  };
};

export type Guild = {
  id: Snowflake;
  name: string;
  icon?: string | null;
  channels: Channel[];
  voice_states?: VoiceState[];
};

export type Message = {
  id: Snowflake;
  channel_id: Snowflake;
  content: string;
  author: User;
  timestamp: string;
  edited_timestamp?: string | null;
  mentions?: User[];
};

export type ReadyPayload = {
  v: number;
  user: User;
  guilds: Guild[];
  session_id: string;
  resume_gateway_url: string;
};

export const ChannelKind = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  GUILD_STAGE_VOICE: 13,
  GUILD_FORUM: 15,
  GUILD_MEDIA: 16,
  isTextType(t: number): boolean {
    return (
      t === this.GUILD_TEXT ||
      t === this.DM ||
      t === this.GROUP_DM ||
      t === this.GUILD_ANNOUNCEMENT
    );
  },
  isVoiceType(t: number): boolean {
    return t === this.GUILD_VOICE || t === this.GUILD_STAGE_VOICE;
  },
} as const;
