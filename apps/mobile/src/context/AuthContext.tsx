import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

import { apiRequest, loadStoredToken, setApiToken } from "../api/client";
import { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isMediumCenterUser(user: SessionUser) {
  return user.center?.code === "M002" &&
    ["CENTER_MANAGER", "DOCTOR", "PATIENT", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"].includes(user.role);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredToken()
      .then((token) => token ? apiRequest<{ user: SessionUser }>("/auth/me") : null)
      .then(async (payload) => {
        if (payload && isMediumCenterUser(payload.user)) {
          setUser(payload.user);
        } else if (payload) {
          await setApiToken(null);
        }
      })
      .catch(async () => {
        await setApiToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(identifier: string, password: string) {
    const payload = await apiRequest<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password })
    });
    if (!isMediumCenterUser(payload.user)) {
      throw new Error("هذا الحساب لا ينتمي إلى المركز الصحي المتوسط.");
    }
    await setApiToken(payload.token);
    setUser(payload.user);
  }

  async function logout() {
    await setApiToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("يجب استخدام AuthProvider.");
  return context;
}
