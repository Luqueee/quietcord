import React from 'react';
import {Text} from 'ink';
import type {VoiceState} from '../../domain/types.js';

type Props = {
  statusFlash: string | null;
  queueSize: number;
  unread: number;
  voiceStates: VoiceState[];
  channelName: string;
  visible: boolean;
};

export function StatusBar({statusFlash, queueSize, unread, voiceStates, channelName, visible}: Props) {
  if (!visible) return null;
  return (
    <>
      <Text dimColor>
        {(statusFlash ?? ' ').padEnd(40)}
        {queueSize > 0 ? ` queued:${queueSize}` : ''}
        {voiceStates.length > 0 ? ` in-voice:${voiceStates.length}` : ''}
        {unread > 0 ? ` ●${unread}` : ''}
      </Text>
      <Text dimColor>
        #{channelName}
        {unread > 0 ? <Text color="yellow"> ●{unread}</Text> : null}
      </Text>
    </>
  );
}
