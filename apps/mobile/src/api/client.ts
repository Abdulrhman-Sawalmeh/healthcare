import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "healthcare.medium.mobile.token";

let apiToken: string | null = null;

function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:4100/api";
  }

  return "http://localhost:4100/api";
}

const API_URL = resolveApiUrl();

async function writeToken(token: string | null) {
  if (Platform.OS === "web") {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(STORAGE_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }
}

async function readToken() {
  if (Platform.OS === "web") {
    return window.localStorage.getItem(STORAGE_KEY);
  }

  return SecureStore.getItemAsync(STORAGE_KEY);
}

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function setApiToken(token: string | null) {
  apiToken = token;
  await writeToken(token);
}

export async function loadStoredToken() {
  apiToken = await readToken();
  return apiToken;
}

export function getApiUrl() {
  if (Platform.OS === "web") {
    return API_URL.replace("10.0.2.2", "localhost");
  }

  return API_URL;
}

export function getHealthUrl() {
  return getApiUrl().replace(/\/api$/, "/health");
}

export async function checkApiHealth() {
  const response = await fetch(getHealthUrl());
  return response.ok;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiUrl();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (apiToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new ApiError(`تعذر الاتصال بالخادم. تأكد أن الهاتف والكمبيوتر على نفس الشبكة وأن الرابط ${baseUrl} يعمل.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : typeof payload === "string" && payload.trim()
          ? payload
          : "حدث خطأ أثناء الاتصال بالخادم.";
    throw new ApiError(message, response.status);
  }

  return payload as T;
}
