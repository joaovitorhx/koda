import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReconnectLoop } from '@/features/sensors/reconnect';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('backs off after disconnect and stops retries once connected', async () => {
  const loop = new ReconnectLoop(),
    work = vi
      .fn()
      .mockRejectedValueOnce(new Error('out of range'))
      .mockRejectedValueOnce(new Error('radio off'))
      .mockResolvedValue(undefined);
  await loop.start(work);
  expect(work).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(work).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(work).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(work).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60000);
  expect(work).toHaveBeenCalledTimes(3);
  loop.stop();
});
it('wakes on native events without parallel connection attempts', async () => {
  const loop = new ReconnectLoop();
  let resolve!: () => void;
  const work = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const first = loop.start(work);
  expect(loop.wake()).toBe(first);
  resolve();
  await first;
  expect(work).toHaveBeenCalledOnce();
});
it('cancels retries on logout/manual disconnect and invalidates in-flight callbacks', async () => {
  const loop = new ReconnectLoop();
  let current!: () => boolean, resolve!: () => void;
  const first = loop.start((c) => {
    current = c;
    return new Promise<void>((r) => {
      resolve = r;
    });
  });
  expect(current()).toBe(true);
  loop.stop();
  expect(current()).toBe(false);
  resolve();
  await first;
  await vi.advanceTimersByTimeAsync(60000);
  expect(vi.getTimerCount()).toBe(0);
});
it('switches targets after the old connection settles without resurrecting it', async () => {
  const loop = new ReconnectLoop();
  let finish!: () => void;
  const first = loop.start(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const next = vi.fn(async () => {});
  const second = loop.start(next);
  expect(next).not.toHaveBeenCalled();
  finish();
  await first;
  await second;
  expect(next).toHaveBeenCalledOnce();
});
