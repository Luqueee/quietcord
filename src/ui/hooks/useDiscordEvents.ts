import {useEffect, useRef} from 'react';
import type {DiscordClient} from '../../discord.js';

export function useDiscordEvents(
  client: DiscordClient | null,
  handlers: {
    onMessage?: (m: import('../../domain/types.js').Message) => void;
    onMessageUpdate?: (m: import('../../domain/types.js').Message) => void;
    onMessageDelete?: (d: {id: string; channel_id: string}) => void;
    onQueueUpdate?: (size: number) => void;
    onVoiceStateUpdate?: () => void;
  }
): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!client) return;
    const onMsg = (m: import('../../domain/types.js').Message): void =>
      ref.current.onMessage?.(m);
    const onUpd = (m: import('../../domain/types.js').Message): void =>
      ref.current.onMessageUpdate?.(m);
    const onDel = (d: {id: string; channel_id: string}): void =>
      ref.current.onMessageDelete?.(d);
    const onQueue = (size: number): void => ref.current.onQueueUpdate?.(size);
    const onVoice = (): void => ref.current.onVoiceStateUpdate?.();

    client.on('message', onMsg);
    client.on('messageUpdate', onUpd);
    client.on('messageDelete', onDel);
    client.on('queueUpdate', onQueue);
    client.on('voiceStateUpdate', onVoice);
    return () => {
      client.off('message', onMsg);
      client.off('messageUpdate', onUpd);
      client.off('messageDelete', onDel);
      client.off('queueUpdate', onQueue);
      client.off('voiceStateUpdate', onVoice);
    };
  }, [client]);
}
