import React from 'react';
import {Box} from 'ink';
import SelectInput from 'ink-select-input';
import type {GuildItem} from '../../state/selectors.js';

type Props = {
  guilds: GuildItem[];
  onSelect: (item: GuildItem) => void;
};

export function GuildsView({guilds, onSelect}: Props) {
  return (
    <Box flexDirection="column">
      <SelectInput items={guilds} onSelect={onSelect} limit={15} />
    </Box>
  );
}
