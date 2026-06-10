import React from 'react';
import {Box, Text} from 'ink';

type Props = {
  draft: string;
  visible: boolean;
};

export function StealthInput({draft, visible}: Props) {
  if (!visible) return null;
  return (
    <Box>
      <Text color="green">› </Text>
      <Text inverse> </Text>
      {draft ? <Text>{draft}</Text> : null}
    </Box>
  );
}
