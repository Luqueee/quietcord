import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import type {ChannelItem} from '../../state/selectors.js';
import type {Guild} from '../../domain/types.js';

type Props = {
  guild: Guild;
  channels: ChannelItem[];
  onSelect: (item: ChannelItem) => void;
};

export function ChannelsView({guild, channels, onSelect}: Props) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text dimColor>{guild.name}</Text>
      </Box>
      <SelectInput items={channels} onSelect={onSelect} limit={15} />
    </Box>
  );
}
