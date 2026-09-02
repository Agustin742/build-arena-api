import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import type { LeaderboardEntry } from './leaderboard.service';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('rating')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Global ranking by rating',
    description:
      'Read only, and the same board for everyone. Ratings move only when a ranked battle ends',
  })
  @ApiOkResponse({ type: LeaderboardEntryDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findTop(@Query() query: LeaderboardQueryDto): Promise<LeaderboardEntry[]> {
    return this.leaderboard.findTop(query.limit);
  }
}
