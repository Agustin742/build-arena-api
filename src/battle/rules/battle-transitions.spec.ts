import { BattleStatus } from '../../generated/prisma/enums';
import {
  BATTLE_CLOSURE,
  BATTLE_TRANSITIONS,
  applyTransition,
  closeBattle,
} from './battle-transitions';
import type { BattleTransition, StoredBattle } from './battle-transitions';

const CHALLENGER = '11111111-0000-4000-8000-000000000001';
const OPPONENT = '22222222-0000-4000-8000-000000000002';
const STRANGER = '33333333-0000-4000-8000-000000000003';

const battle = (status: BattleStatus): StoredBattle => ({
  challengerId: CHALLENGER,
  opponentId: OPPONENT,
  status,
});

const CLOSED: BattleStatus[] = [
  BattleStatus.ACCEPTED,
  BattleStatus.IN_PROGRESS,
  BattleStatus.FINISHED,
  BattleStatus.REJECTED,
  BattleStatus.CANCELLED,
];

describe('BATTLE_TRANSITIONS', () => {
  it('mirrors the table of the design, one row per transition', () => {
    expect(BATTLE_TRANSITIONS).toEqual({
      ACCEPT: {
        from: BattleStatus.PENDING,
        to: BattleStatus.ACCEPTED,
        entitled: 'OPPONENT',
      },
      REJECT: {
        from: BattleStatus.PENDING,
        to: BattleStatus.REJECTED,
        entitled: 'OPPONENT',
      },
      CANCEL: {
        from: BattleStatus.PENDING,
        to: BattleStatus.CANCELLED,
        entitled: 'CHALLENGER',
      },
      START: {
        from: BattleStatus.ACCEPTED,
        to: BattleStatus.IN_PROGRESS,
        entitled: 'EITHER',
      },
    });
  });
});

describe('applyTransition', () => {
  it('lets the challenged player accept a pending challenge', () => {
    expect(
      applyTransition('ACCEPT', battle(BattleStatus.PENDING), OPPONENT),
    ).toEqual({ allowed: true, to: BattleStatus.ACCEPTED });
  });

  it('does not let the challenger accept their own challenge', () => {
    // The trap of the phase. The status IS pending and the caller IS a
    // participant: only the entitlement check stops this.
    expect(
      applyTransition('ACCEPT', battle(BattleStatus.PENDING), CHALLENGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_ENTITLED' });
  });

  it('does not let the challenger reject their own challenge either', () => {
    expect(
      applyTransition('REJECT', battle(BattleStatus.PENDING), CHALLENGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_ENTITLED' });
  });

  it('lets the challenger cancel while the challenge is pending', () => {
    expect(
      applyTransition('CANCEL', battle(BattleStatus.PENDING), CHALLENGER),
    ).toEqual({ allowed: true, to: BattleStatus.CANCELLED });
  });

  it('does not let the challenged player cancel', () => {
    expect(
      applyTransition('CANCEL', battle(BattleStatus.PENDING), OPPONENT),
    ).toMatchObject({ allowed: false, reason: 'NOT_ENTITLED' });
  });

  it.each(CLOSED)('refuses to accept a %s challenge', (status) => {
    expect(applyTransition('ACCEPT', battle(status), OPPONENT)).toMatchObject({
      allowed: false,
      reason: 'WRONG_STATUS',
    });
  });

  it.each(CLOSED)('refuses to cancel a %s challenge', (status) => {
    expect(applyTransition('CANCEL', battle(status), CHALLENGER)).toMatchObject(
      { allowed: false, reason: 'WRONG_STATUS' },
    );
  });

  it('lets either side start an accepted battle', () => {
    // The REST surface never drives this one: phase 6 starts a battle from
    // the gateway, once both are connected. The rule lives here so that both
    // surfaces read the same table.
    expect(
      applyTransition('START', battle(BattleStatus.ACCEPTED), CHALLENGER),
    ).toEqual({ allowed: true, to: BattleStatus.IN_PROGRESS });
    expect(
      applyTransition('START', battle(BattleStatus.ACCEPTED), OPPONENT),
    ).toEqual({ allowed: true, to: BattleStatus.IN_PROGRESS });
  });

  it.each<BattleTransition>(['ACCEPT', 'REJECT', 'CANCEL', 'START'])(
    'refuses %s to a player outside the battle',
    (transition) => {
      expect(
        applyTransition(transition, battle(BattleStatus.PENDING), STRANGER),
      ).toMatchObject({ allowed: false, reason: 'NOT_A_PARTICIPANT' });
    },
  );

  it('reports the outsider before the status', () => {
    // A stranger must never learn from the answer what state the battle is in.
    expect(
      applyTransition('ACCEPT', battle(BattleStatus.FINISHED), STRANGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_A_PARTICIPANT' });
  });
});

describe('BATTLE_CLOSURE', () => {
  it('is the one server-decided edge, with no entitled side', () => {
    expect(BATTLE_CLOSURE).toEqual({
      from: BattleStatus.IN_PROGRESS,
      to: BattleStatus.FINISHED,
    });
  });
});

describe('closeBattle', () => {
  it('closes an in-progress battle by defeat', () => {
    expect(
      closeBattle(battle(BattleStatus.IN_PROGRESS), CHALLENGER, 'DEFEAT'),
    ).toEqual({
      allowed: true,
      to: BattleStatus.FINISHED,
      winnerId: CHALLENGER,
      reason: 'DEFEAT',
    });
  });

  it('closes an in-progress battle by abandonment', () => {
    expect(
      closeBattle(battle(BattleStatus.IN_PROGRESS), OPPONENT, 'ABANDONMENT'),
    ).toEqual({
      allowed: true,
      to: BattleStatus.FINISHED,
      winnerId: OPPONENT,
      reason: 'ABANDONMENT',
    });
  });

  it.each<BattleStatus>([
    BattleStatus.PENDING,
    BattleStatus.ACCEPTED,
    BattleStatus.FINISHED,
    BattleStatus.REJECTED,
    BattleStatus.CANCELLED,
  ])('refuses to close a %s battle', (status) => {
    expect(closeBattle(battle(status), CHALLENGER, 'DEFEAT')).toMatchObject({
      allowed: false,
      reason: 'WRONG_STATUS',
    });
  });
});

describe('reachable statuses', () => {
  it('covers every BattleStatus except PENDING between BATTLE_TRANSITIONS and BATTLE_CLOSURE', () => {
    // A structural guard: a status made reachable by some future direct
    // `update` must fail this suite rather than silently drifting.
    const reachable = new Set(
      Object.values(BATTLE_TRANSITIONS)
        .map((rule) => rule.to)
        .concat(BATTLE_CLOSURE.to),
    );

    const allExceptPending = Object.values(BattleStatus).filter(
      (status) => status !== BattleStatus.PENDING,
    );

    expect([...reachable].sort()).toEqual([...allExceptPending].sort());
  });
});
