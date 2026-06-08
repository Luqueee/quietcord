export type MdToken =
  | {kind: 'text'; value: string}
  | {kind: 'bold'; value: MdToken[]}
  | {kind: 'italic'; value: MdToken[]}
  | {kind: 'code'; value: string}
  | {kind: 'codeblock'; lang: string; value: string}
  | {kind: 'spoiler'; value: MdToken[]}
  | {kind: 'quote'; value: MdToken[]}
  | {kind: 'mention_user'; id: string; display: string}
  | {kind: 'mention_channel'; id: string; display: string}
  | {kind: 'link'; text: string; url: string};

export type MentionResolver = {
  resolveUser(id: string): string | null;
  resolveChannel(id: string): string | null;
};

type Pattern = {
  regex: RegExp;
  build: (match: RegExpMatchArray, resolver: MentionResolver) => MdToken | null;
};

const PATTERNS: Pattern[] = [
  {
    regex: /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    build: m => ({kind: 'codeblock', lang: m[1] || '', value: m[2]}),
  },
  {
    regex: /`([^`\n]+)`/g,
    build: m => ({kind: 'code', value: m[1]}),
  },
  {
    regex: /\*\*([^*\n]+)\*\*/g,
    build: (m, r) => ({kind: 'bold', value: tokenizeText(m[1], r)}),
  },
  {
    regex: /\*\*([^*\n]+)\*\*/g,
    build: (m, r) => ({kind: 'bold', value: tokenizeText(m[1], r)}),
  },
  {
    regex: /\|\|([^\n]+?)\|\|/g,
    build: (m, r) => ({kind: 'spoiler', value: tokenizeText(m[1], r)}),
  },
  {
    regex: /<@!?(\d+)>/g,
    build: m => ({kind: 'mention_user', id: m[1], display: '@unknown'}),
  },
  {
    regex: /<#(\d+)>/g,
    build: m => ({kind: 'mention_channel', id: m[1], display: '#unknown'}),
  },
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/g,
    build: m => ({kind: 'link', text: m[1], url: m[2]}),
  },
  {
    regex: /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
    build: (m, r) => {
      const captured = m[2];
      if (!captured) return null;
      return {kind: 'italic', value: tokenizeText(captured, r)};
    },
  },
];

function tokenizeText(input: string, resolver: MentionResolver): MdToken[] {
  const out: MdToken[] = [];
  let text = input;

  for (const {regex, build} of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let next = '';
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(lastIndex, m.index);
      if (before) next += before;
      const token = build(m as unknown as RegExpMatchArray, resolver);
      if (token) {
        next += `\u0000${out.length}\u0000`;
        out.push(token);
      } else {
        next += m[0];
      }
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) {
      const rest = text.slice(lastIndex);
      next += rest;
    }
    text = next;
  }

  if (text) {
    const parts: MdToken[] = [];
    const re = /\u0000(\d+)\u0000/g;
    let m: RegExpExecArray | null;
    let cursor = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > cursor) {
        const literal = text.slice(cursor, m.index);
        if (literal) parts.push({kind: 'text', value: literal});
      }
      const idx = Number(m[1]);
      if (idx >= 0 && idx < out.length) {
        parts.push(out[idx]);
      } else {
        parts.push({kind: 'text', value: text.slice(m.index, m.index + m[0].length)});
      }
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) {
      const literal = text.slice(cursor);
      if (literal) parts.push({kind: 'text', value: literal});
    }
    return parts;
  }

  return out;
}

export function parseMarkdown(input: string, resolver: MentionResolver): MdToken[] {
  const lines = input.split('\n');
  const out: MdToken[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('> ')) {
      out.push({kind: 'quote', value: tokenizeText(line.slice(2), resolver)});
    } else if (line === '>') {
      out.push({kind: 'quote', value: [{kind: 'text', value: ''}]});
    } else if (line) {
      out.push(...tokenizeText(line, resolver));
    }
  }
  return out;
}

export function plainText(tokens: MdToken[]): string {
  let out = '';
  for (const t of tokens) {
    switch (t.kind) {
      case 'text':
      case 'code':
      case 'codeblock':
        out += t.value;
        break;
      case 'mention_user':
      case 'mention_channel':
        out += t.display;
        break;
      case 'link':
        out += t.text;
        break;
      default:
        if ('value' in t && Array.isArray((t as {value: MdToken[]}).value)) {
          out += plainText((t as {value: MdToken[]}).value);
        }
    }
  }
  return out;
}
