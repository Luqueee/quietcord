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
