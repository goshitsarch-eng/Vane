import { describe, expect, it } from 'vitest';
import SessionManager from '@/lib/session';

const nextMicrotask = () => Promise.resolve();

describe('SessionManager', () => {
  it('lets subscribers unsubscribe before replayed events fire', async () => {
    const session = new SessionManager('replay-unsubscribe');
    const events: string[] = [];

    session.emit('data', { type: 'response', data: 'already happened' });

    const disconnect = session.subscribe((event) => {
      events.push(event);
    });

    disconnect();
    await nextMicrotask();

    expect(events).toEqual([]);
  });

  it('replays existing session events to reconnecting subscribers', async () => {
    const session = new SessionManager('replay-existing');
    const events: string[] = [];

    session.emit('data', { type: 'response', data: 'chunk' });
    session.emit('end', {});

    session.subscribe((event) => {
      events.push(event);
    });

    await nextMicrotask();

    expect(events).toEqual(['data', 'end']);
  });

  it('preserves replay order when a live event arrives before replay starts', async () => {
    const session = new SessionManager('replay-order');
    const events: string[] = [];

    session.emit('data', { type: 'response', data: 'old' });

    session.subscribe((event, data) => {
      events.push(`${event}:${data.data ?? data.type ?? ''}`);
    });

    session.emit('data', { type: 'response', data: 'new' });

    await nextMicrotask();

    expect(events).toEqual(['data:old', 'data:new']);
  });
});
