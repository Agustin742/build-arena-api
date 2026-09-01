import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BattleService } from './battle.service';
import type { PublicBattle } from './battle.mapper';
import { BattleDto } from './dto/battle.dto';
import { CreateBattleDto } from './dto/create-battle.dto';

/**
 * A battle the caller is not in answers 404, never 403: a 403 would confirm
 * that those two players are fighting.
 */
const FOREIGN_OR_MISSING = 'The battle does not exist, or you are not in it';

/** Being in the battle is not the same as being allowed to make the move. */
const NOT_ENTITLED = 'You are in this battle, but you cannot make that move';

@ApiTags('battle')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('battles')
export class BattleController {
  constructor(private readonly battleService: BattleService) {}

  @Post()
  @ApiOperation({ summary: 'Challenge another player with one of your builds' })
  @ApiCreatedResponse({ type: BattleDto })
  @ApiBadRequestResponse({
    description: 'The challenge breaks a rule, and the answer names which one',
  })
  @ApiNotFoundResponse({
    description: 'That player does not exist, or the build is not yours',
  })
  challenge(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBattleDto,
  ): Promise<PublicBattle> {
    return this.battleService.challenge(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List your battles',
    description: 'Both the challenges you sent and the ones you received',
  })
  @ApiOkResponse({ type: BattleDto, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<PublicBattle[]> {
    return this.battleService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one of your battles' })
  @ApiOkResponse({ type: BattleDto })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicBattle> {
    return this.battleService.findOne(id, user.id);
  }

  @Patch(':id/accept')
  @ApiOperation({
    summary: 'Accept a challenge sent to you',
    description:
      'Being in a pending battle is not enough: only the challenged player can accept it',
  })
  @ApiOkResponse({ type: BattleDto })
  @ApiForbiddenResponse({ description: NOT_ENTITLED })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicBattle> {
    return this.battleService.accept(id, user.id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a challenge sent to you' })
  @ApiOkResponse({ type: BattleDto })
  @ApiForbiddenResponse({ description: NOT_ENTITLED })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicBattle> {
    return this.battleService.reject(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Take back a challenge you sent',
    description: 'Only while it is still pending',
  })
  @ApiOkResponse({ type: BattleDto })
  @ApiForbiddenResponse({ description: NOT_ENTITLED })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicBattle> {
    return this.battleService.cancel(id, user.id);
  }
}
