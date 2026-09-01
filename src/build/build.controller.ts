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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { PublicBuild } from './build.mapper';
import { BuildService } from './build.service';
import { BuildDto } from './dto/build.dto';
import { CreateBuildDto } from './dto/create-build.dto';
import { UpdateBuildDto } from './dto/update-build.dto';

/**
 * Every route here answers 404 rather than 403 on a build the caller does not
 * own: a 403 would confirm that the build exists.
 */
const FOREIGN_OR_MISSING = 'The build does not exist, or is not yours';

@ApiTags('build')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('builds')
export class BuildController {
  constructor(private readonly buildService: BuildService) {}

  @Post()
  @ApiOperation({ summary: 'Create a build for the authenticated user' })
  @ApiCreatedResponse({ type: BuildDto })
  @ApiBadRequestResponse({
    description: 'The build breaks a rule, and the answer names which one',
  })
  @ApiConflictResponse({
    description: 'You already have a build with that name',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBuildDto,
  ): Promise<PublicBuild> {
    return this.buildService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List your builds' })
  @ApiOkResponse({ type: BuildDto, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<PublicBuild[]> {
    return this.buildService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one of your builds' })
  @ApiOkResponse({ type: BuildDto })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicBuild> {
    return this.buildService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change one of your builds',
    description:
      'The change is merged into the stored build and the result is validated as a whole',
  })
  @ApiOkResponse({ type: BuildDto })
  @ApiBadRequestResponse({
    description: 'The resulting build breaks a rule, and the answer names it',
  })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  @ApiConflictResponse({
    description: 'You already have a build with that name',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBuildDto,
  ): Promise<PublicBuild> {
    return this.buildService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of your builds' })
  @ApiNoContentResponse({ description: 'Build deleted' })
  @ApiNotFoundResponse({ description: FOREIGN_OR_MISSING })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.buildService.remove(id, user.id);
  }
}
