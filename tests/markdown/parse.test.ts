import {describe, it, expect} from 'vitest';
import {parseMarkdown, plainText} from '../../src/markdown/parse.js';
import type {MentionResolver} from '../../src/markdown/types.js';

const noopResolver: MentionResolver = {
  resolveUser: () => null,
  resolveChannel: () => null,
};

describe('markdown/parse', () => {
  it('parses inline code', () => {
    const tokens = parseMarkdown('hello `code` world', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('hello code world');
  });

  it('parses fenced codeblock with lang', () => {
    const src = '```ts\nconst x = 1;\n```';
    const tokens = parseMarkdown(src, noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('const x = 1;');
    const code = tokens.find(t => t.kind === 'codeblock');
    expect(code).toBeDefined();
    expect(code && code.kind === 'codeblock' && code.lang).toBe('ts');
  });

  it('parses bold with **', () => {
    const tokens = parseMarkdown('**bold**', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('bold');
  });

  it('parses italic with single *', () => {
    const tokens = parseMarkdown('*italic*', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('italic');
  });

  it('parses spoiler with ||', () => {
    const tokens = parseMarkdown('||secret||', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('secret');
  });

  it('parses quote on line beginning with >', () => {
    const tokens = parseMarkdown('> quoted text', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('quoted text');
  });

  it('parses user mention with placeholder display', () => {
    const tokens = parseMarkdown('hi <@12345>!', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('hi @unknown!');
  });

  it('parses user mention with nickname syntax <@!id>', () => {
    const tokens = parseMarkdown('<@!12345>', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('@unknown');
  });

  it('parses channel mention with placeholder display', () => {
    const tokens = parseMarkdown('goto <#67890>', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('goto #unknown');
  });

  it('parses links', () => {
    const tokens = parseMarkdown('[label](https://example.com)', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('label');
  });

  it('handles multiline text', () => {
    const tokens = parseMarkdown('line1\nline2', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('line1line2');
  });

  it('handles mixed bold and code', () => {
    const tokens = parseMarkdown('**bold** and `code`', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('bold and code');
  });

  it('plain text passes through when no markup', () => {
    const tokens = parseMarkdown('just text', noopResolver);
    const text = plainText(tokens);
    expect(text).toBe('just text');
  });
});
