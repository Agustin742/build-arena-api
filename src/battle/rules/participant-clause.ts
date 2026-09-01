/**
 * The pure "who may see this battle" predicate, expressed as the Prisma OR
 * clause fragments that scope a lookup to a battle's two participants. This
 * is the thing that must never diverge between REST and the WebSocket
 * gateway: both surfaces filter through this SAME clause, so "in the battle"
 * means one thing everywhere it is checked.
 */
export const participantClause = (currentUserId: string) => [
  { challengerId: currentUserId },
  { opponentId: currentUserId },
];
