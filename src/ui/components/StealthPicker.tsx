import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

type Item = {label: string; value: string};

type Props = {
  title: string;
  items: Item[];
  onSelect: (item: Item) => void;
  limit?: number;
};

export function StealthPicker({title, items, onSelect, limit = 15}: Props) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>{title}</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={onSelect} limit={limit} />
      </Box>
    </Box>
  );
}
