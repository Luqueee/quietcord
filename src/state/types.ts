export type ChatMessage = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  isMe: boolean;
  ts: number;
  editedAt?: number | undefined;
  deleted?: boolean | undefined;
};
