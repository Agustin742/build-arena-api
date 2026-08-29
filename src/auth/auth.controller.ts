import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserProfileDto } from '../user/dto/user-profile.dto';
import type { PublicUser } from '../user/user.mapper';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import type { TokenPair } from './token.service';

const CREDENTIAL_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({ type: UserProfileDto })
  @ApiConflictResponse({ description: 'Email or username is already taken' })
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and get a fresh pair',
    description: 'The refresh token sent here stops working immediately',
  })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session',
    description:
      'Clears the stored refresh token. The access token stays valid until it expires',
  })
  @ApiNoContentResponse({ description: 'Session closed' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.profile(user.id);
  }
}
