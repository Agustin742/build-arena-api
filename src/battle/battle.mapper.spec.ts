import { BattleStatus } from '../generated/prisma/enums';
import { toPublicBattle } from './battle.mapper';
import type { BattleWithPlayers } from './battle.mapper';

const CHALLENGER = '11111111-0000-4000-8000-000000000001';
const OPPONENT = '22222222-0000-4000-8000-000000000002';

const stored = (overrides: Partial<BattleWithPlayers> = {}) =>
  ({
    id: '33333333-0000-4000-8000-000000000003',
    challengerId: CHALLENGER,
    opponentId: OPPONENT,
    challengerBuildId: '44444444-0000-4000-8000-000000000004',
    status: BattleStatus.PENDING,
    ranked: true,
    winnerId: null,
    currentRound: 0,
    activeUserId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    startedAt: null,
    endedAt: null,
    challenger: { id: CHALLENGER, username: 'ada', rating: 1200 },
    opponent: { id: OPPONENT, username: 'grace', rating: 1350 },
    ...overrides,
  }) as BattleWithPlayers;

describe('toPublicBattle', () => {
  it('shows the challenger their role and the player they challenged', () => {
    expect(toPublicBattle(stored(), CHALLENGER)).toEqual({
      id: stored().id,
      status: BattleStatus.PENDING,
      ranked: true,
      role: 'CHALLENGER',
      rival: { id: OPPONENT, username: 'grace', rating: 1350 },
      outcome: null,
      currentRound: 0,
      createdAt: stored().createdAt,
      startedAt: null,
      endedAt: null,
    });
  });

  it('shows the challenged player their role and who challenged them', () => {
    expect(toPublicBattle(stored(), OPPONENT)).toMatchObject({
      role: 'OPPONENT',
      rival: { id: CHALLENGER, username: 'ada', rating: 1200 },
    });
  });

  it('reads the outcome against the viewer, not as a raw winner id', () => {
    const finished = stored({
      status: BattleStatus.FINISHED,
      winnerId: OPPONENT,
    });

    expect(toPublicBattle(finished, OPPONENT).outcome).toBe('WON');
    expect(toPublicBattle(finished, CHALLENGER).outcome).toBe('LOST');
  });

  it('leaves the outcome open while nobody has won', () => {
    expect(
      toPublicBattle(stored({ status: BattleStatus.IN_PROGRESS }), OPPONENT)
        .outcome,
    ).toBeNull();
  });

  it('never leaks the raw participant ids or the frozen build reference', () => {
    // Which side you are on is answered by `role`. Shipping the ids would
    // hand every caller the other player's identifiers for free.
    const view = toPublicBattle(stored(), CHALLENGER) as Record<
      string,
      unknown
    >;

    expect(view.challengerId).toBeUndefined();
    expect(view.opponentId).toBeUndefined();
    expect(view.winnerId).toBeUndefined();
    expect(view.challengerBuildId).toBeUndefined();
  });
});
