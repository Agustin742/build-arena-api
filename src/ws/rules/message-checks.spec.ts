import { BattleStatus, SkillType } from '../../generated/prisma/enums';
import type { WsErrorCode } from '../battle-events';
import { CHECKS, authorize } from './message-checks';
import type { MessageIntent, SessionContext } from './message-checks';

const ACTOR = '11111111-0000-4000-8000-000000000001';
const OTHER = '22222222-0000-4000-8000-000000000002';

const ACTION_SKILL = { code: 'SLASH', type: SkillType.ACTION };
const REACTION_SKILL = { code: 'DODGE', type: SkillType.REACTION };

/** A participant, mid-battle, on their own turn, with nothing pending — the shape every test narrows from. */
const baseCtx = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  intent: 'ACTION',
  actorId: ACTOR,
  declaredSkillCode: null,
  isParticipant: true,
  status: BattleStatus.IN_PROGRESS,
  activeUserId: ACTOR,
  reactionWindowOpen: false,
  actor: { reactionAvailable: true, kit: [ACTION_SKILL, REACTION_SKILL] },
  slotOccupied: false,
  ...overrides,
});

const check = (ctx: SessionContext) => authorize(ctx.intent, ctx);

describe('CHECKS', () => {
  it('declares the seven validations, once, in order', () => {
    expect(CHECKS.map((c) => c.id)).toEqual([
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
      'V7',
    ]);
  });
});

describe('V1 — sender must be a participant', () => {
  it('admits a participant', () => {
    expect(check(baseCtx({ intent: 'JOIN' }))).toBeNull();
  });

  it('refuses a stranger with the generic REST-matching message', () => {
    expect(check(baseCtx({ intent: 'JOIN', isParticipant: false }))).toEqual({
      code: 'NOT_FOUND',
      message: 'Battle not found',
    });
  });

  it('applies to ACTION and REACTION too, not only JOIN', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', isParticipant: false })),
    ).toMatchObject({ code: 'NOT_FOUND' });
    expect(
      check(baseCtx({ intent: 'REACTION', isParticipant: false })),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('V2 — the battle must be in the right status', () => {
  it('lets JOIN through for an accepted battle, not yet started', () => {
    expect(
      check(baseCtx({ intent: 'JOIN', status: BattleStatus.ACCEPTED })),
    ).toBeNull();
  });

  it('lets JOIN through once the battle is in progress', () => {
    expect(
      check(baseCtx({ intent: 'JOIN', status: BattleStatus.IN_PROGRESS })),
    ).toBeNull();
  });

  it('lets JOIN through for a finished battle, so the result stays readable', () => {
    expect(
      check(baseCtx({ intent: 'JOIN', status: BattleStatus.FINISHED })),
    ).toBeNull();
  });

  it('refuses JOIN for a battle still pending', () => {
    expect(
      check(baseCtx({ intent: 'JOIN', status: BattleStatus.PENDING })),
    ).toMatchObject({ code: 'WRONG_STATUS' });
  });

  it('refuses an action for an accepted-but-not-started battle', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', status: BattleStatus.ACCEPTED })),
    ).toMatchObject({ code: 'WRONG_STATUS' });
  });

  it('refuses an action for an already-finished battle', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', status: BattleStatus.FINISHED })),
    ).toMatchObject({ code: 'WRONG_STATUS' });
  });
});

describe('V3 — turn ownership and the reaction window', () => {
  it('admits an action from the active player', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', activeUserId: ACTOR })),
    ).toBeNull();
  });

  it('refuses an action from the non-active player as NOT_YOUR_TURN', () => {
    expect(check(baseCtx({ intent: 'ACTION', activeUserId: OTHER }))).toEqual({
      code: 'NOT_YOUR_TURN',
      message: 'It is not your turn',
    });
  });

  it('refuses a second action from the active player while their window is open as ALREADY_DECLARED', () => {
    expect(
      check(
        baseCtx({
          intent: 'ACTION',
          activeUserId: ACTOR,
          reactionWindowOpen: true,
        }),
      ),
    ).toEqual({
      code: 'ALREADY_DECLARED',
      message: 'You already declared your action for this round',
    });
  });

  it('admits a reaction from the defending participant while their window is open', () => {
    expect(
      check(
        baseCtx({
          intent: 'REACTION',
          actorId: OTHER,
          activeUserId: ACTOR,
          reactionWindowOpen: true,
        }),
      ),
    ).toBeNull();
  });

  it('refuses a reaction with no open window as NO_OPEN_WINDOW', () => {
    expect(
      check(
        baseCtx({
          intent: 'REACTION',
          actorId: OTHER,
          activeUserId: ACTOR,
          reactionWindowOpen: false,
        }),
      ),
    ).toEqual({
      code: 'NO_OPEN_WINDOW',
      message: 'There is no reaction window open for you to answer',
    });
  });

  it('keeps NOT_YOUR_TURN, ALREADY_DECLARED and NO_OPEN_WINDOW as three distinct codes', () => {
    const codes: (WsErrorCode | undefined)[] = [
      check(baseCtx({ intent: 'ACTION', activeUserId: OTHER }))?.code,
      check(
        baseCtx({
          intent: 'ACTION',
          activeUserId: ACTOR,
          reactionWindowOpen: true,
        }),
      )?.code,
      check(baseCtx({ intent: 'REACTION', actorId: OTHER }))?.code,
    ];

    expect(new Set(codes)).toEqual(
      new Set<WsErrorCode>([
        'NOT_YOUR_TURN',
        'ALREADY_DECLARED',
        'NO_OPEN_WINDOW',
      ]),
    );
  });

  it('does not apply to JOIN', () => {
    expect(check(baseCtx({ intent: 'JOIN', activeUserId: OTHER }))).toBeNull();
  });
});

describe('V4 — the declared skill must belong to the kit', () => {
  it('admits a skill that is in the kit', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', declaredSkillCode: 'SLASH' })),
    ).toBeNull();
  });

  it('refuses a skill outside the kit', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', declaredSkillCode: 'FIREBALL' })),
    ).toEqual({
      code: 'SKILL_NOT_IN_KIT',
      message: 'That skill is not part of your kit for this battle',
    });
  });

  it('lets an explicit decline (null skillCode) through without a kit check', () => {
    expect(
      check(
        baseCtx({
          intent: 'REACTION',
          actorId: OTHER,
          activeUserId: ACTOR,
          reactionWindowOpen: true,
          declaredSkillCode: null,
        }),
      ),
    ).toBeNull();
  });
});

describe('V5 — the skill type must match the moment', () => {
  it('admits an ACTION-type skill declared as an action', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', declaredSkillCode: 'SLASH' })),
    ).toBeNull();
  });

  it('refuses a REACTION-type skill declared as an action', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', declaredSkillCode: 'DODGE' })),
    ).toEqual({
      code: 'WRONG_SKILL_TYPE',
      message: 'A reaction skill cannot be declared as an action',
    });
  });

  it('refuses an ACTION-type skill declared as a reaction', () => {
    expect(
      check(
        baseCtx({
          intent: 'REACTION',
          actorId: OTHER,
          activeUserId: ACTOR,
          reactionWindowOpen: true,
          declaredSkillCode: 'SLASH',
        }),
      ),
    ).toEqual({
      code: 'WRONG_SKILL_TYPE',
      message: 'An action skill cannot be declared as a reaction',
    });
  });

  it('admits a REACTION-type skill declared as a reaction', () => {
    expect(
      check(
        baseCtx({
          intent: 'REACTION',
          actorId: OTHER,
          activeUserId: ACTOR,
          reactionWindowOpen: true,
          declaredSkillCode: 'DODGE',
        }),
      ),
    ).toBeNull();
  });
});

describe('V6 — the reaction must still be available', () => {
  const reactionCtx = (overrides: Partial<SessionContext> = {}) =>
    baseCtx({
      intent: 'REACTION',
      actorId: OTHER,
      activeUserId: ACTOR,
      reactionWindowOpen: true,
      declaredSkillCode: 'DODGE',
      actor: { reactionAvailable: true, kit: [ACTION_SKILL, REACTION_SKILL] },
      ...overrides,
    });

  it('admits a reaction while it is still available', () => {
    expect(check(reactionCtx())).toBeNull();
  });

  it('refuses a spent reaction', () => {
    expect(
      check(
        reactionCtx({
          actor: {
            reactionAvailable: false,
            kit: [ACTION_SKILL, REACTION_SKILL],
          },
        }),
      ),
    ).toEqual({
      code: 'REACTION_UNAVAILABLE',
      message: 'Your reaction is not available this round',
    });
  });

  it('lets an explicit decline through even with no reaction left', () => {
    expect(
      check(
        reactionCtx({
          declaredSkillCode: null,
          actor: {
            reactionAvailable: false,
            kit: [ACTION_SKILL, REACTION_SKILL],
          },
        }),
      ),
    ).toBeNull();
  });

  it('does not apply to ACTION', () => {
    expect(
      check(
        baseCtx({
          intent: 'ACTION',
          declaredSkillCode: 'SLASH',
          actor: { reactionAvailable: false, kit: [ACTION_SKILL] },
        }),
      ),
    ).toBeNull();
  });
});

describe('V7 — no turn already recorded at this slot', () => {
  it('admits a message for a free slot', () => {
    expect(
      check(baseCtx({ intent: 'ACTION', slotOccupied: false })),
    ).toBeNull();
  });

  it('refuses a message for a slot that already has a turn', () => {
    expect(check(baseCtx({ intent: 'ACTION', slotOccupied: true }))).toEqual({
      code: 'TURN_ALREADY_RECORDED',
      message: 'A turn is already recorded for this slot',
    });
  });
});

describe('authorize', () => {
  it('returns null once every applicable check passes', () => {
    expect(
      authorize('ACTION', baseCtx({ declaredSkillCode: 'SLASH' })),
    ).toBeNull();
  });

  it('stops at the first failing check, in CHECKS order', () => {
    // Both V1 (not a participant) and V2 (wrong status) would fail here;
    // only V1's refusal must surface.
    expect(
      authorize(
        'ACTION',
        baseCtx({
          isParticipant: false,
          status: BattleStatus.PENDING,
        }),
      ),
    ).toEqual({ code: 'NOT_FOUND', message: 'Battle not found' });
  });

  it.each<MessageIntent>(['JOIN', 'ACTION', 'REACTION'])(
    'is a stranger to a non-existent battle exactly as it is to a real one, for %s',
    (intent) => {
      expect(
        authorize(intent, baseCtx({ intent, isParticipant: false })),
      ).toEqual({ code: 'NOT_FOUND', message: 'Battle not found' });
    },
  );
});
