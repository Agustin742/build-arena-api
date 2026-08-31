/**
 * The only place a game rule rounds. Every combat module that needs to
 * round a rule value routes through these three functions (D3) — the sole
 * other `Math.floor` under `src/combat/` lives in `random-source.ts`, for
 * die draws, which is not rule arithmetic.
 */

/** `floor((score - 10) / 2)` — the attribute-to-bonus formula (overview.md §4.1). */
export const modifier = (score: number): number => Math.floor((score - 10) / 2);

/** `floor(value / 2)` — used for WEAKENED, a successful save, and PARRY. */
export const halve = (value: number): number => Math.floor(value / 2);

/** A value below zero clamps to zero; never negative damage or HP loss. */
export const clampDamage = (value: number): number => (value < 0 ? 0 : value);
