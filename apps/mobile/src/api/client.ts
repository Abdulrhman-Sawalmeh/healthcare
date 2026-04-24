import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "healthcare.mobile.token";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000/api";

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function loadStoredToken() {
  accessToken = await AsyncStorage.getItem(STORAGE_KEY);
  return accessToken;
}

export async function setApiToken(token: string | null) {
  accessToken = token;

  if (token) {
    await AsyncStorage.setItem(STORAGE_KEY, token);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = "Request failed.";

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
