import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState
} from "react";

import { apiRequest, loadStoredToken, setApiToken } from "../api/client";
import { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredToken()
      .then((token) => {
        if (!token) {
          return null;
        }

        return apiRequest<{ user: SessionUser }>("/auth/me");
      })
      .then((payload) => {
        if (payload) {
          setUser(payload.user);
        }
      })
      .catch(async () => {
        await setApiToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(email: string, password: string) {
    const payload = await apiRequest<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    await setApiToken(payload.token);
    setUser(payload.user);
  }

  async function logout() {
    await setApiToken(null);
    setUser(null);
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
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
