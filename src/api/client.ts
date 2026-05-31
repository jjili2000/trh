const BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('trh_token');
}

export function setToken(token: string): void {
  localStorage.setItem('trh_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('trh_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Ne pas forcer Content-Type pour FormData : le navigateur gère la boundary multipart
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('Session expirée, veuillez vous reconnecter.');
    }
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || 'Erreur serveur');
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),

  /** Upload multipart (POST avec FormData). Passe un AbortSignal pour annuler. */
  upload: <T>(path: string, formData: FormData, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body: formData, signal }),

  /** Update multipart (PUT avec FormData). */
  uploadPut: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'PUT', body: formData }),
};

/**
 * Construit l'URL d'un fichier protégé avec le token JWT en query param.
 * Utilisable directement dans <img src="…"> ou <a href="…">.
 */
export function fileUrl(module: 'expenses' | 'documents', filename: string): string {
  const token = getToken();
  return `/api/files/${module}/${encodeURIComponent(filename)}${token ? `?token=${token}` : ''}`;
}
