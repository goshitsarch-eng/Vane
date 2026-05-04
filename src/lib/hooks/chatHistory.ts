export type ChatHistory = [string, string][];

export const sliceRewriteHistory = (
  history: ChatHistory,
  messageIndex: number,
) => {
  if (messageIndex < 0) {
    return history;
  }

  return history.slice(0, messageIndex * 2);
};
