import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState
} from "react";

import { apiRequest, getStoredToken, setApiToken } from "../api/client";
import { isUserAllowedForSystem, systemConfig } from "../config/system";
import { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      setLoading(false);
      return;
    }

    setApiToken(token);
    apiRequest<{ user: SessionUser }>("/auth/me")
      .then((payload) => {
        if (!isUserAllowedForSystem(payload.user)) {
          setApiToken(null);
          setUser(null);
          return;
        }

        setUser(payload.user);
      })
      .catch(() => {
        setApiToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(identifier: string, password: string) {
    const payload = await apiRequest<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password })
    });

    if (!isUserAllowedForSystem(payload.user)) {
      setApiToken(null);
      setUser(null);
      throw new Error(systemConfig.accessDeniedMessage);
    }

    setApiToken(payload.token);
    setUser(payload.user);
  }

  function logout() {
    setApiToken(null);
    setUser(null);
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Strict`;
      }
    });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("يجب استخدام AuthProvider قبل استدعاء useAuth.");
  }

  return context;
}
