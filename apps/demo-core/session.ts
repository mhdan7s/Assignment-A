export type SessionState = {
  id: string;
  authenticated: boolean;
  username?: string;
  /** Show system notice interstitial once */
  pendingInterstitial: boolean;
  /** Next authenticated request becomes session-expired */
  expireNextRequest: boolean;
  /** Artificial delay in ms for search/detail */
  slowMs: number;
  /** Force permission denial even for active members */
  forcePermissionDenied: boolean;
  createdAt: number;
};

const sessions = new Map<string, SessionState>();

export function createSession(): SessionState {
  const id = `sess_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const session: SessionState = {
    id,
    authenticated: false,
    pendingInterstitial: false,
    expireNextRequest: false,
    slowMs: 0,
    forcePermissionDenied: false,
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string | undefined): SessionState | undefined {
  if (!id) return undefined;
  return sessions.get(id);
}

export function destroySession(id: string): void {
  sessions.delete(id);
}
