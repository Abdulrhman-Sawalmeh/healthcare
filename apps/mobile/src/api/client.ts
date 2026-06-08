import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "healthcare.medium.mobile.token";
const defaultHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const configuredUrl = process.env.EXPO_PUBLIC_API_URL ?? `http://${defaultHost}:4100/api`;
const API_URL = (Platform.OS === "web" ? configuredUrl.replace("10.0.2.2", "localhost") : configuredUrl).replace(/\/$/, "");

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function loadStoredToken() {
  accessToken = Platform.OS === "web"
    ? globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    : await SecureStore.getItemAsync(STORAGE_KEY);
  return accessToken;
}

export async function setApiToken(token: string | null) {
  accessToken = token;
  if (Platform.OS === "web") {
    if (token) globalThis.localStorage?.setItem(STORAGE_KEY, token);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
    return;
  }
  if (token) {
    await SecureStore.setItemAsync(STORAGE_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
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

export function getApiUrl() {
  return API_URL;
}
