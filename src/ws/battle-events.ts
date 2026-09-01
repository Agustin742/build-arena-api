import type { AuthenticatedUser } from '../auth/authenticated-user';

/**
 * Event names, error codes, and connection-scoped payload types shared by
 * the gateway and its middleware. Partial for this slice — later slices
 * extend it, never edit an earlier slice's export, per the `src/combat`
 * convention.
 */

export const ClientEvent = {
  JOIN: 'battle:join',
  ACTION: 'battle:action',
  REACTION: 'battle:reaction',
} as const;

export const ServerEvent = {
  STATE: 'battle:state',
  ROUND_START: 'battle:round_start',
  REACTION_WINDOW: 'battle:reaction_window',
  TURN_RESOLVED: 'battle:turn_resolved',
  ENDED: 'battle:ended',
  OPPONENT_LEFT: 'battle:opponent_left',
  ERROR: 'battle:error',
} as const;

export type WsErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'WRONG_STATUS'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_DECLARED'
  | 'NO_OPEN_WINDOW'
  | 'SKILL_NOT_IN_KIT'
  | 'WRONG_SKILL_TYPE'
  | 'REACTION_UNAVAILABLE'
  | 'TURN_ALREADY_RECORDED';

export type WsErrorPayload = {
  code: WsErrorCode;
  message: string;
  event?: string;
};

/**
 * Attached to `socket.data` by the handshake middleware. Imported
 * type-only from `src/auth`, so the socket identity is the same shape REST
 * uses without `src/ws` gaining a runtime dependency on `AuthModule`.
 */
export type SocketData = {
  user: AuthenticatedUser;
};
