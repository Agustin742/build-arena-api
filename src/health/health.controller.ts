import { Controller, Get } from '@nestjs/common';

import type { HealthStatus } from './health-status.interface';

@Controller('health')
export class HealthController {
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
