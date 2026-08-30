import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { HealthStatusDto } from './dto/health-status.dto';
import type { HealthStatus } from './health-status.interface';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Service status, version and uptime' })
  @ApiOkResponse({ type: HealthStatusDto })
  check(): HealthStatus {
    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? 'dev',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
