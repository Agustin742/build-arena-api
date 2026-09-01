import { SystemRandomSource } from '../combat';

import type { Provider } from '@nestjs/common';

/**
 * The engine takes its randomness as an argument so it stays pure. Anything
 * that drives the engine from NestJS asks for it by this token, and a test
 * swaps in a scripted source instead of stubbing Math.random globally.
 */
export const RANDOM_SOURCE = 'RANDOM_SOURCE';

export const randomSourceProvider: Provider = {
  provide: RANDOM_SOURCE,
  useClass: SystemRandomSource,
};
