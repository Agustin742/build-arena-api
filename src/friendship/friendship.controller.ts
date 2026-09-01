import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { FriendshipDto } from './dto/friendship.dto';
import { FriendshipService } from './friendship.service';
import type { PublicFriendship } from './friendship.mapper';

/**
 * A friendship the caller is not part of answers 404, never 403: a 403 would
 * confirm that those two players know each other.
 */
const FOREIGN_OR_MISSING = 'The friendship does not exist, or is not yours';

@ApiTags('friendship')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('friendships')
export class FriendshipController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Post()
  @ApiOperation({ summary: 'Send a friend request to another player' })
  @ApiCreatedResponse({ type: FriendshipDto })
  @ApiBadRequestResponse({
    description: 'The request breaks a rule, and the answer names which one',
  })
  @ApiNotFoundResponse({ description: 'That player does not exist' })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFriendshipDto,
  ): Promise<PublicFriendship> {
    return this.friendshipService.request(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List your friendships',
    description: 'Both the requests you sent and the ones you received',
  })
  @ApiOkResponse({ type: FriendshipDto, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<PublicFriendship[]> {
    return this.friendshipService.findAll(user.id);
  }

  @Patch(':id/accept')
  @ApiOperation({
    summary: 'Accept a friend request addressed to you',
    description:
      'Being part of a pending request is not enough: only the addressee can accept it',
  })
  @ApiOkResponse({ type: FriendshipDto })
  @ApiForbiddenResponse({
    description: 'You are in this friendship, but you cannot accept it',
  })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicFriendship> {
    return this.friendshipService.accept(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Drop a friendship',
    description:
      'Rejects the request if you received it, cancels it if you sent it, and unfriends once accepted',
  })
  @ApiNoContentResponse({ description: 'Friendship dropped' })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.friendshipService.remove(id, user.id);
  }
}
