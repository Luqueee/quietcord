import React from 'react';
import {Text, Box} from 'ink';
import {MdToken, MentionResolver, parseMarkdown, plainText} from './markdown.js';

type Props = {
  content: string;
  resolver: MentionResolver;
  isMe: boolean;
  deleted?: boolean;
  edited?: boolean;
  width?: number;
};

function renderTokens(tokens: MdToken[], width: number, keyPrefix = ''): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  tokens.forEach((t, i) => {
    const k = `${keyPrefix}${i}`;
    switch (t.kind) {
      case 'text':
        if (t.value) nodes.push(<Text key={k}>{t.value}</Text>);
        break;
      case 'bold':
        nodes.push(
          <Text key={k} bold>
            {renderTokens(t.value, width, k + '.')}
          </Text>
        );
        break;
      case 'italic':
        nodes.push(
          <Text key={k} italic>
            {renderTokens(t.value, width, k + '.')}
          </Text>
        );
        break;
      case 'code':
        nodes.push(
          <Text key={k} color="yellow">
            {t.value}
          </Text>
        );
        break;
      case 'codeblock':
        nodes.push(
          <Box key={k} flexDirection="column" marginLeft={2} borderStyle="round" borderColor="gray" paddingX={1}>
            <Text color="yellow">{t.value.trim()}</Text>
          </Box>
        );
        break;
      case 'spoiler':
        nodes.push(
          <Text key={k} color="black" backgroundColor="gray">
            {renderTokens(t.value, width, k + '.')}
          </Text>
        );
        break;
      case 'quote':
        nodes.push(
          <Box key={k} borderLeft={true} borderColor="gray" paddingLeft={1} flexDirection="row">
            <Text dimColor>│ </Text>
            <Text>{renderTokens(t.value, width, k + '.')}</Text>
          </Box>
        );
        break;
      case 'mention_user':
        nodes.push(
          <Text key={k} color="blue">
            @{t.display}
          </Text>
        );
        break;
      case 'mention_channel':
        nodes.push(
          <Text key={k} color="blue">
            #{t.display}
          </Text>
        );
        break;
      case 'link':
        nodes.push(
          <Text key={k} color="blue" underline>
            {t.text}
          </Text>
        );
        break;
    }
  });
  return nodes;
}

export function renderContent(props: Props): React.ReactNode {
  const {content, resolver, isMe, deleted, edited, width = 80} = props;
  if (deleted) {
    return <Text dimColor>[deleted]</Text>;
  }
  const tokens = parseMarkdown(content, resolver);
  const text = plainText(tokens);
  const truncated = text.length > width ? text.slice(0, width - 1) + '…' : text;
  return (
    <Text>
      {truncated}
      {edited ? <Text dimColor> (edited)</Text> : null}
    </Text>
  );
}

export function renderInline(content: string, resolver: MentionResolver): React.ReactNode {
  const tokens = parseMarkdown(content, resolver);
  return <Text>{renderTokens(tokens, 200)}</Text>;
}

export {plainText, parseMarkdown};
export type {MdToken, MentionResolver};
