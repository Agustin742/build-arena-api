import { participantClause } from './participant-clause';

const CHALLENGER = '11111111-0000-4000-8000-000000000001';
const OPPONENT = '22222222-0000-4000-8000-000000000002';
const STRANGER = '33333333-0000-4000-8000-000000000003';

const battle = { challengerId: CHALLENGER, opponentId: OPPONENT };

/**
 * Evaluates the OR clause fragments the same way Prisma's query engine
 * would: the battle matches if ANY clause's keys all equal the battle's
 * corresponding fields. This proves the extracted clause is the same
 * "who may see this battle" predicate REST already relied on, without
 * needing a real database.
 */
const matches = (userId: string): boolean =>
  participantClause(userId).some((clause) =>
    Object.entries(clause).every(
      ([key, value]) => battle[key as keyof typeof battle] === value,
    ),
  );

describe('participantClause', () => {
  it('matches the challenger of the battle', () => {
    expect(matches(CHALLENGER)).toBe(true);
  });

  it('matches the opponent of the battle', () => {
    expect(matches(OPPONENT)).toBe(true);
  });

  it('does not match a stranger to the battle', () => {
    expect(matches(STRANGER)).toBe(false);
  });
});
