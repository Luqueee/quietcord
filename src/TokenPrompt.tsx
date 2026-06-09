import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';

type Props = {
  configPath: string;
  onSave: (token: string) => void;
  onQuit: () => void;
};

export default function TokenPrompt({configPath, onSave, onQuit}: Props) {
  const [value, setValue] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  useInput((input, key) => {
    if ((key.ctrl && input === 'c') || key.escape) {
      onQuit();
    }
  });

  const submit = () => {
    const t = value.trim();
    if (!t) {
      setHint('token is empty');
      return;
    }
    onSave(t);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text>No token found. Paste your Discord user token:</Text>
      </Box>
      <Box>
        <Text color="green">› </Text>
        <TextInput value={value} onChange={setValue} onSubmit={submit} mask="*" />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>will be saved to {configPath} (mode 0600)</Text>
        <Text dimColor>how to get your token: devtools → network → authorization header</Text>
        {hint ? <Text color="yellow">{hint}</Text> : null}
        <Text dimColor>enter to save · esc/ctrl+c to quit</Text>
      </Box>
    </Box>
  );
}
