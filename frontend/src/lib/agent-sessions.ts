import { generateUUID } from '@/lib/uuid';

export interface AgentSession {
  id: string;
  name: string;
  /** 最近更新时间（毫秒时间戳），用于会话列表时间注释 */
  updatedAt: number;
}

const SESSIONS_KEY = 'nova-agent-sessions';
const ACTIVE_SESSION_KEY = 'nova-agent-active-session';
const DEFAULT_SESSION: AgentSession = { id: 'default', name: '默认会话', updatedAt: 0 };

function now(): number {
  return Date.now();
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneSession(session: AgentSession): AgentSession {
  return { id: session.id, name: session.name, updatedAt: session.updatedAt };
}

function readUpdatedAt(value: Record<string, unknown>, fallback: number): number {
  if (typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt > 0) {
    return value.updatedAt;
  }
  return fallback;
}

function normalizeSessions(values: unknown[]): { sessions: AgentSession[]; migrated: boolean } {
  const unique = new Map<string, AgentSession>();
  let index = 0;
  let migrated = false;
  for (const value of values) {
    if (!isAgentSessionLike(value) || unique.has(value.id)) continue;
    const hasUpdatedAt = typeof value.updatedAt === 'number'
      && Number.isFinite(value.updatedAt)
      && value.updatedAt > 0;
    const fallback = now() - index * 60_000;
    if (!hasUpdatedAt) migrated = true;
    unique.set(value.id, {
      id: value.id,
      name: value.name,
      updatedAt: readUpdatedAt(value, fallback),
    });
    index += 1;
  }

  const defaultSession = unique.get(DEFAULT_SESSION.id) || {
    ...cloneSession(DEFAULT_SESSION),
    updatedAt: now(),
  };
  if (!unique.has(DEFAULT_SESSION.id)) migrated = true;
  const otherSessions = [...unique.values()].filter(session => session.id !== DEFAULT_SESSION.id);
  return { sessions: [defaultSession, ...otherSessions], migrated };
}

function getStoredSessions(): AgentSession[] {
  const storage = getStorage();
  if (!storage) return [{ ...cloneSession(DEFAULT_SESSION), updatedAt: now() }];

  try {
    const raw = storage.getItem(SESSIONS_KEY);
    if (!raw) return [{ ...cloneSession(DEFAULT_SESSION), updatedAt: now() }];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [{ ...cloneSession(DEFAULT_SESSION), updatedAt: now() }];
    const { sessions, migrated } = normalizeSessions(parsed);
    if (migrated) saveSessions(sessions);
    return sessions;
  } catch {
    return [{ ...cloneSession(DEFAULT_SESSION), updatedAt: now() }];
  }
}

function isAgentSessionLike(value: unknown): value is { id: string; name: string; updatedAt?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.id === 'string' && session.id.length > 0
    && typeof session.name === 'string' && session.name.length > 0;
}

function saveSessions(sessions: AgentSession[]): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // Keep the in-memory registry usable when storage is unavailable.
  }
}

/** 格式：年/月/日 小时:分钟，例如 2026/10/25 14:30（英文冒号） */
export function formatAgentSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function listAgentSessions(): AgentSession[] {
  return getStoredSessions();
}

export function createAgentSession(name = '新会话'): AgentSession {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('会话名称不能为空');

  const session = { id: generateUUID(), name: normalizedName, updatedAt: now() };
  saveSessions([...getStoredSessions(), session]);
  return session;
}

export function renameAgentSession(id: string, name: string): boolean {
  const normalizedName = name.trim();
  if (!normalizedName) return false;

  const sessions = getStoredSessions();
  const index = sessions.findIndex(session => session.id === id);
  if (index < 0) return false;

  const renamed = sessions.map(session => (
    session.id === id
      ? { ...session, name: normalizedName, updatedAt: now() }
      : session
  ));
  saveSessions(renamed);
  return true;
}

export function touchAgentSession(id: string, updatedAt = now()): boolean {
  const sessions = getStoredSessions();
  const index = sessions.findIndex(session => session.id === id);
  if (index < 0) return false;

  const next = sessions.map(session => (
    session.id === id ? { ...session, updatedAt } : session
  ));
  saveSessions(next);
  return true;
}

export function setAgentSessionUpdatedAt(id: string, updatedAt: number): boolean {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  return touchAgentSession(id, updatedAt);
}

export function deleteAgentSession(id: string): boolean {
  if (id === DEFAULT_SESSION.id) return false;

  const sessions = getStoredSessions();
  if (!sessions.some(session => session.id === id)) return false;
  const wasActive = getActiveAgentSessionId() === id;

  saveSessions(sessions.filter(session => session.id !== id));
  if (wasActive) setActiveAgentSessionId(DEFAULT_SESSION.id);
  return true;
}

export function getActiveAgentSessionId(): string {
  const storage = getStorage();
  if (!storage) return DEFAULT_SESSION.id;

  try {
    const activeId = storage.getItem(ACTIVE_SESSION_KEY);
    if (!activeId || !getStoredSessions().some(session => session.id === activeId)) {
      return DEFAULT_SESSION.id;
    }
    return activeId;
  } catch {
    return DEFAULT_SESSION.id;
  }
}

export function setActiveAgentSessionId(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  if (!getStoredSessions().some(session => session.id === id)) return false;

  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(ACTIVE_SESSION_KEY, id);
    return true;
  } catch {
    return false;
  }
}
