import { idleImport, type ImportSnapshot } from './import';
import { CHANNEL, parseSnapshot } from './protocol';

export class ImportController {
  private state = idleImport();
  private run: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private inject: (run: string) => Promise<unknown>, private win: Window = window) {
    win.addEventListener('message', this.receive);
  }
  snapshot(): ImportSnapshot { return structuredClone(this.state); }
  private receive = (event: MessageEvent) => {
    if (!this.run || event.source !== this.win || event.origin !== this.win.location.origin || event.data?.channel !== CHANNEL || event.data?.run !== this.run) return;
    if (event.data.operation === 'ready') {
      this.win.postMessage({ channel: CHANNEL, run: this.run, operation: 'begin' }, this.win.location.origin);
      return;
    }
    if (event.data.operation !== 'progress') return;
    const snapshot = parseSnapshot(event.data.snapshot);
    if (!snapshot || snapshot.status === 'idle') return;
    this.state = snapshot;
    clearTimeout(this.timer);
    if (snapshot.status === 'running') this.armTimeout();
    else this.run = null;
  };
  private armTimeout() {
    this.timer = setTimeout(() => {
      this.cancel();
      this.state.status = this.state.items.length ? 'partial' : 'failed';
      this.state.problem = 'timeout';
    }, 20_000);
  }
  async start() {
    if (this.run) return this.snapshot();
    const run = crypto.randomUUID();
    this.run = run;
    this.state = { ...idleImport(), status: 'running', coverage: { club: 'partial', 'sbc-storage': 'not-started' } };
    this.armTimeout();
    try { await this.inject(run); }
    catch {
      if (this.run === run) {
        this.cancel();
        this.state.status = 'failed';
        this.state.problem = 'service';
      }
    }
    return this.snapshot();
  }
  cancel() {
    if (this.run) {
      this.win.postMessage({ channel: CHANNEL, operation: 'cancel', run: this.run }, this.win.location.origin);
      this.run = null;
      this.state.status = 'cancelled';
      clearTimeout(this.timer);
    }
    return this.snapshot();
  }
  dispose() { this.cancel(); this.win.removeEventListener('message', this.receive); }
}
