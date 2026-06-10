import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import type {Mode} from '../../state/machine.js';

type Item = {label: string; value: Mode};

const items: Item[] = [
  {label: 'Normal', value: 'normal'},
  {label: 'Discreto', value: 'stealth'},
];

type Props = {
  onSelect: (mode: Mode) => void;
};

export function ModeSelect({onSelect}: Props) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Selecciona modo:</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={item => onSelect(item.value)} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>discreto: solo input · ctrl+g historial · esc cambiar canal</Text>
      </Box>
    </Box>
  );
}
