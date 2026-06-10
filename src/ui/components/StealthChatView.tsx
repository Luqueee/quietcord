import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import type {Channel} from '../../domain/types.js';
import type {ChatMessage} from '../../state/types.js';

type Props = {
  channel: Channel;
  messages: ChatMessage[];
  draft: string;
  visible: boolean;
  loadingHistory?: boolean | undefined;
  height?: number;
};

function Input({draft}: {draft: string}) {
  return (
    <Box>
      <Text color="green">› </Text>
      <Text inverse> </Text>
      {draft ? <Text>{draft}</Text> : null}
    </Box>
  );
}

export function StealthChatView({
  channel,
  messages,
  draft,
  visible,
  loadingHistory,
  height = 14,
}: Props) {
  const slice = useMemo(() => messages.slice(-height), [messages, height]);
  if (!visible) {
    return (
      <Box flexDirection="column">
        <Input draft={draft} />
        <Text dimColor>#{channel.name}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={height} overflow="hidden" flexShrink={0}>
        {slice.map(m => (
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
          <Text dimColor>{loadingHistory ? 'cargando historial…' : 'sin mensajes · esc cerrar historial'}</Text>
        ) : null}
      </Box>
      <Input draft={draft} />
      <Text dimColor>#{channel.name} · esc cerrar historial</Text>
    </Box>
  );
}
