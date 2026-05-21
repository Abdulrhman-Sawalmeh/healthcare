import { systemConfig } from "../config/system";

const API_URL = import.meta.env.VITE_MEDIUM_API_URL ?? systemConfig.apiUrl;
const STORAGE_KEY = systemConfig.storageKey;

let accessToken = localStorage.getItem(STORAGE_KEY);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function setApiToken(token: string | null) {
  accessToken = token;

  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getStoredToken() {
  return accessToken;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = "تعذر تنفيذ الطلب.";

    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}
