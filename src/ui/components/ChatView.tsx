import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import type {Channel, VoiceState} from '../../domain/types.js';
import type {ChatMessage} from '../../state/types.js';
import type {MentionResolver} from '../../markdown/types.js';
import {MessageRow} from './MessageRow.js';
import {StatusBar} from './StatusBar.js';

type Props = {
  channel: Channel;
  messages: ChatMessage[];
  draft: string;
  resolver: MentionResolver;
  statusFlash: string | null;
  queueSize: number;
  unread: number;
  voiceStates: VoiceState[];
  loadingHistory?: boolean | undefined;
  visible: boolean;
  height?: number;
  showStatusBar: boolean;
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

export function ChatView({
  channel,
  messages,
  draft,
  resolver,
  statusFlash,
  queueSize,
  unread,
  voiceStates,
  loadingHistory,
  visible,
  height = 14,
  showStatusBar,
}: Props) {
  const slice = useMemo(() => messages.slice(-height), [messages, height]);
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={height} overflow="hidden" flexShrink={0}>
        {visible && slice.map(m => (
          <MessageRow key={m.id} message={m} resolver={resolver} />
        ))}
        {visible && messages.length === 0 ? (
          <Text dimColor>{loadingHistory ? 'cargando historial…' : ' '}</Text>
        ) : null}
      </Box>
      <Input draft={draft} />
      {showStatusBar ? (
        <StatusBar
          statusFlash={statusFlash}
          queueSize={queueSize}
          unread={unread}
          voiceStates={voiceStates}
          channelName={channel.name}
          visible
        />
      ) : null}
    </Box>
  );
}
