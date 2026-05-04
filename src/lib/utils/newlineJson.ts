export const consumeNewlineJson = <T>(
  buffer: string,
  chunk: string,
  onMessage: (message: T) => void,
) => {
  const lines = (buffer + chunk).split(/\r?\n/);
  const tail = lines.pop() ?? '';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    onMessage(JSON.parse(trimmed) as T);
  });

  return tail;
};

export const flushNewlineJson = <T>(
  buffer: string,
  onMessage: (message: T) => void,
) => {
  const trimmed = buffer.trim();

  if (trimmed) {
    onMessage(JSON.parse(trimmed) as T);
  }
};
