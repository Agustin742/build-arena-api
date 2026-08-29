import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import type { HealthStatus } from './health-status.interface';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? 'dev',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
