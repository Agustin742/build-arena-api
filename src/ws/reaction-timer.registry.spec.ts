import { ReactionTimerRegistry } from './reaction-timer.registry';

const BATTLE_ID = '33333333-0000-4000-8000-000000000003';

describe('ReactionTimerRegistry', () => {
  let registry: ReactionTimerRegistry;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new ReactionTimerRegistry();
  });

  afterEach(() => {
    registry.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('arm', () => {
    it('fires the callback once the deadline is reached, not before', () => {
      const onExpire = jest.fn();
      const deadline = new Date(Date.now() + 15_000);

      registry.arm(BATTLE_ID, deadline, onExpire);

      jest.advanceTimersByTime(14_999);
      expect(onExpire).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('replaces an existing timer for the same battle rather than stacking two', () => {
      const stale = jest.fn();
      const fresh = jest.fn();

      registry.arm(BATTLE_ID, new Date(Date.now() + 15_000), stale);
      registry.arm(BATTLE_ID, new Date(Date.now() + 15_000), fresh);

      jest.advanceTimersByTime(15_000);

      expect(stale).not.toHaveBeenCalled();
      expect(fresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('clears a scheduled timer so it never fires', () => {
      const onExpire = jest.fn();
      registry.arm(BATTLE_ID, new Date(Date.now() + 15_000), onExpire);

      registry.cancel(BATTLE_ID);
      jest.advanceTimersByTime(20_000);

      expect(onExpire).not.toHaveBeenCalled();
    });

    it('is a no-op for a battle with no armed timer', () => {
      expect(() => registry.cancel('does-not-exist')).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('clears every outstanding timer across battles', () => {
      const a = jest.fn();
      const b = jest.fn();
      registry.arm('battle-a', new Date(Date.now() + 15_000), a);
      registry.arm('battle-b', new Date(Date.now() + 15_000), b);

      registry.onModuleDestroy();
      jest.advanceTimersByTime(20_000);

      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });
  });
});
