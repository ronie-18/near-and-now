/**
 * Admin session storage — abstracts over sessionStorage vs localStorage so a
 * "Remember me" login can persist across tab/browser close, while a
 * non-remembered login keeps the old behavior of dying with the tab.
 * The two backends are never populated at the same time; reads check both
 * since only the caller of setAdminSession knows which one is active.
 */

const KEYS = ['adminToken', 'adminData', 'adminTokenExpiry'] as const;

function readItem(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

export function getAdminToken(): string | null {
  return readItem('adminToken');
}

export function getAdminDataRaw(): string | null {
  return readItem('adminData');
}

export function getAdminTokenExpiry(): string | null {
  return readItem('adminTokenExpiry');
}

export function setAdminSession(admin: unknown, token: string, expiresAt: number, remember: boolean): void {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;

  store.setItem('adminData', JSON.stringify(admin));
  store.setItem('adminToken', token);
  store.setItem('adminTokenExpiry', expiresAt.toString());

  for (const key of KEYS) {
    other.removeItem(key);
  }
}

/**
 * Overwrite the stored admin object in place (e.g. after a profile/prefs
 * update), keeping it in whichever storage the active session already uses.
 */
export function updateStoredAdminData(admin: unknown): void {
  const store = localStorage.getItem('adminData') !== null ? localStorage : sessionStorage;
  store.setItem('adminData', JSON.stringify(admin));
}

export function clearAdminSession(): void {
  for (const key of KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
