import { ApiProperty } from '@nestjs/swagger';

/**
 * Exactly `PublicPlayer` plus the position. Never an email, never a hash:
 * a leaderboard renders rivals, and rivals stop at the same three fields
 * every other module stops at.
 */
export class LeaderboardEntryDto {
  @ApiProperty({ example: 1, description: 'Position on the board, from 1' })
  rank!: number;

  @ApiProperty({ example: '3f1c9d2e-8b7a-4f6d-9c1e-2a5b7d8e0f11' })
  id!: string;

  @ApiProperty({ example: 'ada' })
  username!: string;

  @ApiProperty({ example: 1216, description: 'Everyone starts at 1200' })
  rating!: number;
}
