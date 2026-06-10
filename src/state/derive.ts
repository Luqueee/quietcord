import type {Message, User} from '../domain/types.js';
import type {ChatMessage} from './types.js';

export function toChatMessage(message: Message, selfId?: string): ChatMessage {
  return {
    id: message.id,
    author: displayName(message.author),
    authorId: message.author.id,
    content: message.content,
    isMe: selfId ? message.author.id === selfId : false,
    ts: Date.parse(message.timestamp) || Date.now(),
    editedAt: message.edited_timestamp
      ? Date.parse(message.edited_timestamp) || undefined
      : undefined,
  };
}

function displayName(u: User): string {
  return u.global_name || u.username || '???';
}
