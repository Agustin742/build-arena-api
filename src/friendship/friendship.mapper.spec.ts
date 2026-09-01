import { FriendshipStatus } from '../generated/prisma/enums';
import { toPublicFriendship } from './friendship.mapper';
import type { FriendshipWithPlayers } from './friendship.mapper';

const REQUESTER = '11111111-0000-4000-8000-000000000001';
const ADDRESSEE = '22222222-0000-4000-8000-000000000002';

const stored: FriendshipWithPlayers = {
  id: '33333333-0000-4000-8000-000000000003',
  requesterId: REQUESTER,
  addresseeId: ADDRESSEE,
  status: FriendshipStatus.PENDING,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  requester: { id: REQUESTER, username: 'ada', rating: 1200 },
  addressee: { id: ADDRESSEE, username: 'grace', rating: 1350 },
};

describe('toPublicFriendship', () => {
  it('shows the requester the other player, and the request as outgoing', () => {
    expect(toPublicFriendship(stored, REQUESTER)).toEqual({
      id: stored.id,
      status: FriendshipStatus.PENDING,
      direction: 'OUTGOING',
      player: { id: ADDRESSEE, username: 'grace', rating: 1350 },
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    });
  });

  it('shows the addressee the other player, and the request as incoming', () => {
    expect(toPublicFriendship(stored, ADDRESSEE)).toMatchObject({
      direction: 'INCOMING',
      player: { id: REQUESTER, username: 'ada', rating: 1200 },
    });
  });

  it('never leaks the raw participant ids of the row', () => {
    // Whose row it is, is answered by `direction`. Shipping both ids would
    // hand every caller the other player's side of the arena for free.
    const view = toPublicFriendship(stored, REQUESTER) as Record<
      string,
      unknown
    >;

    expect(view.requesterId).toBeUndefined();
    expect(view.addresseeId).toBeUndefined();
  });
});
