import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('reports an ok status', () => {
    expect(controller.check().status).toBe('ok');
  });

  it('reports the configured version', () => {
    process.env.APP_VERSION = '1.2.3';

    expect(controller.check().version).toBe('1.2.3');
  });

  it('falls back to dev when no version is configured', () => {
    delete process.env.APP_VERSION;

    expect(controller.check().version).toBe('dev');
  });

  it('reports a non negative uptime', () => {
    expect(controller.check().uptime).toBeGreaterThanOrEqual(0);
  });

  it('reports a parseable timestamp', () => {
    expect(Number.isNaN(Date.parse(controller.check().timestamp))).toBe(false);
  });
});
