// A cancellable retry loop. OS Bluetooth/location events can wake it when JS
// timers were suspended; only one connection attempt can be in flight.
export class ReconnectLoop {
  private timer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private generation = 0;
  private running?: Promise<void>;
  private runningGeneration = -1;
  private work?: (current: () => boolean) => Promise<void>;
  start(work: (current: () => boolean) => Promise<void>) {
    this.stop();
    this.work = work;
    return this.wake();
  }
  wake(): Promise<void> {
    if (!this.work) return Promise.resolve();
    if (this.running)
      return this.runningGeneration === this.generation
        ? this.running
        : this.running.then(() => this.wake());
    clearTimeout(this.timer);
    const generation = this.generation,
      work = this.work;
    const current = () => this.generation === generation;
    this.runningGeneration = generation;
    const task = work(current)
      .then(() => {
        if (current()) {
          this.attempt = 0;
          this.work = undefined;
        }
      })
      .catch(() => {
        if (current())
          this.timer = setTimeout(
            () => {
              void this.wake();
            },
            Math.min(30000, 1000 * 2 ** this.attempt++),
          );
      })
      .finally(() => {
        if (this.running === task) this.running = undefined;
      });
    this.running = task;
    return task;
  }
  stop() {
    this.generation++;
    this.work = undefined;
    this.attempt = 0;
    clearTimeout(this.timer);
  }
}
