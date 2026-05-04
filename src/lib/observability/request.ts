export type RequestLogContext = {
  requestId: string;
  route?: string;
};

type LogLevel = 'info' | 'warn' | 'error';

const HEADER_NAMES = ['x-request-id', 'x-correlation-id'];

export const createRequestContext = (
  req?: Request,
  route?: string,
): RequestLogContext => {
  const headerRequestId = HEADER_NAMES.map((header) =>
    req?.headers.get(header),
  ).find(Boolean);

  return {
    requestId: headerRequestId || crypto.randomUUID(),
    route,
  };
};

export const serializeError = (err: unknown) => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    };
  }

  return {
    message: String(err),
  };
};

export const logRequestEvent = (
  context: RequestLogContext | undefined,
  event: string,
  metadata: Record<string, unknown> = {},
  level: LogLevel = 'info',
) => {
  const payload = {
    event,
    requestId: context?.requestId,
    route: context?.route,
    ...metadata,
  };

  const message = JSON.stringify(payload);

  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.info(message);
  }
};
