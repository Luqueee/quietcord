import React from 'react';
import {Box, Text} from 'ink';
import type {ChatMessage} from '../../state/types.js';
import type {MentionResolver} from '../../markdown/types.js';
import {renderContent} from '../../markdown/render.js';

type Props = {
  message: ChatMessage;
  resolver: MentionResolver;
  width?: number;
};

export function MessageRow({message, resolver, width = 80}: Props) {
  return (
    <Box flexDirection="row">
      <Text color={message.isMe ? 'green' : 'cyan'}>
        {(message.author || '???').slice(0, 12).padEnd(12)}{' '}
      </Text>
      {renderContent({
        content: message.content,
        resolver,
        isMe: message.isMe,
        deleted: message.deleted,
        edited: message.editedAt !== undefined,
        width,
      })}
    </Box>
  );
}
