import type {Message, ReadyPayload, Snowflake, User, VoiceState} from './types.js';

export type GatewayEventMap = {
  READY: ReadyPayload;
  MESSAGE_CREATE: Message;
  MESSAGE_UPDATE: Message;
  MESSAGE_DELETE: {id: Snowflake; channel_id: Snowflake};
  TYPING_START: {channel_id: Snowflake; user_id: Snowflake; timestamp: number};
  VOICE_STATE_UPDATE: VoiceState;
  RECONNECT: void;
  RESUMED: void;
  INVALID_SESSION: {resumable: boolean};
  ERROR: Error;
};

export type GatewayEvent = keyof GatewayEventMap;

export type GatewayEventPayload<E extends GatewayEvent> = GatewayEventMap[E];
