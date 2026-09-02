import { Injectable, OnModuleDestroy } from '@nestjs/common';

/** Invoked once the window's deadline is reached — see `arm`'s doc. */
export type ReactionExpiryCallback = () => void;

/**
 * The in-memory comfort layer (design's "The In-Memory Timer"): a
 * `Map<battleId, NodeJS.Timeout>` that fires prompt expiry while the
 * process is alive. It owns no rule and knows nothing about
 * `TurnResolutionService` — the caller supplies the callback, which is
 * always the SAME `resolve()` the reaction handler and the lazy path call.
 * Deleting this class changes no outcome, only how quickly expiry is
 * noticed; that deletability is the proof it is a comfort layer, not the
 * load-bearing mechanism (the persisted `reactionDeadline` is).
 */
@Injectable()
export class ReactionTimerRegistry implements OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /**
   * Schedules `onExpire` at `deadline`. `.unref()` so an outstanding timer
   * never holds the process — or a Jest run — open. Arming a battle that
   * already has a timer replaces it rather than stacking a second one.
   */
  arm(
    battleId: string,
    deadline: Date,
    onExpire: ReactionExpiryCallback,
  ): void {
    this.cancel(battleId);

    const delay = Math.max(0, deadline.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(battleId);
      onExpire();
    }, delay);
    timer.unref();

    this.timers.set(battleId, timer);
  }

  /** Called on every resolution, whichever path reached it first. */
  cancel(battleId: string): void {
    const timer = this.timers.get(battleId);

    if (timer) {
      clearTimeout(timer);
      this.timers.delete(battleId);
    }
  }

  /** Required, or `pnpm test:e2e` reports open handles on shutdown. */
  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
