/**
 * The engine's single source of impurity. Every roll flows through this
 * interface (D1), so a fixed `RandomSource` makes identical inputs produce
 * identical outputs.
 */
export interface RandomSource {
  /** 1..20 */
  rollD20(): number;
  /** Sum of `count` independent d`faces`, e.g. `rollDice('2d6')`. */
  rollDice(notation: string): number;
}

const NOTATION_PATTERN = /^(\d+)d(\d+)$/;

/** Parses `NdM` dice notation. Rejects anything else (Threat Matrix: no other shape is accepted). */
const parseNotation = (notation: string): { count: number; faces: number } => {
  const match = NOTATION_PATTERN.exec(notation);
  if (!match) {
    throw new Error(`Invalid dice notation: "${notation}". Expected the form "NdM".`);
  }
  return { count: Number(match[1]), faces: Number(match[2]) };
};

/** Draws real randomness via `Math.random()`. */
export class SystemRandomSource implements RandomSource {
  rollD20(): number {
    return this.die(20);
  }

  rollDice(notation: string): number {
    const { count, faces } = parseNotation(notation);
    let total = 0;
    for (let i = 0; i < count; i += 1) total += this.die(faces);
    return total;
  }

  private die(faces: number): number {
    return Math.floor(Math.random() * faces) + 1;
  }
}

/**
 * Replays a fixed script, one value per die drawn (D8). Ships as public
 * engine surface, not a test-only helper: `tsconfig.build.json` only
 * excludes `**\/*spec.ts`, so a `testing/` helper would ship in `dist`
 * anyway, and deterministic replay of a logged battle is a real Phase 5/6
 * capability. Exhaustion throws.
 */
export class SequenceRandomSource implements RandomSource {
  private cursor = 0;

  constructor(private readonly script: readonly number[]) {}

  rollD20(): number {
    return this.draw();
  }

  rollDice(notation: string): number {
    const { count } = parseNotation(notation);
    let total = 0;
    for (let i = 0; i < count; i += 1) total += this.draw();
    return total;
  }

  private draw(): number {
    if (this.cursor >= this.script.length) {
      throw new Error('SequenceRandomSource exhausted: no more scripted values to draw.');
    }
    const value = this.script[this.cursor];
    this.cursor += 1;
    return value;
  }
}
