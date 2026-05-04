import SessionManager from '@/lib/session';

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    const session = SessionManager.getSession(id);

    if (!session) {
      return Response.json({ message: 'Session not found' }, { status: 404 });
    }

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    let streamClosed = false;

    const writeStreamEvent = (event: Record<string, unknown>) => {
      if (streamClosed) return;

      writer.write(encoder.encode(JSON.stringify(event) + '\n')).catch(() => {
        streamClosed = true;
      });
    };

    const closeStream = () => {
      if (streamClosed) return;
      streamClosed = true;
      writer.close().catch(() => {});
    };

    const disconnect = session.subscribe((event, data) => {
      if (event === 'data') {
        if (data.type === 'block') {
          writeStreamEvent({
            type: 'block',
            block: data.block,
          });
        } else if (data.type === 'updateBlock') {
          writeStreamEvent({
            type: 'updateBlock',
            blockId: data.blockId,
            patch: data.patch,
          });
        } else if (data.type === 'researchComplete') {
          writeStreamEvent({
            type: 'researchComplete',
          });
        }
      } else if (event === 'end') {
        writeStreamEvent({
          type: 'messageEnd',
        });
        closeStream();
        disconnect();
      } else if (event === 'error') {
        writeStreamEvent({
          type: 'error',
          data: data.data,
        });
        closeStream();
        disconnect();
      }
    });

    req.signal.addEventListener('abort', () => {
      disconnect();
      closeStream();
    });

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    console.error('Error in reconnecting to session stream: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
