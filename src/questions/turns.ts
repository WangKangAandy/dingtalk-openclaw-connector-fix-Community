import { randomUUID } from 'node:crypto';
const tokens = new Map<string, string>();
export function questionTurnScope(accountId: string, botId: string, conversationId: string, senderId: string): string {
  return JSON.stringify([accountId, botId, conversationId, senderId]);
}
export function beginQuestionTurn(scope: string): string {
  const token = randomUUID();
  tokens.delete(scope);
  if (tokens.size >= 1000) tokens.delete(tokens.keys().next().value!);
  tokens.set(scope, token);
  return token;
}
export function isCurrentQuestionTurn(scope: string, token: string): boolean { return tokens.get(scope) === token; }
