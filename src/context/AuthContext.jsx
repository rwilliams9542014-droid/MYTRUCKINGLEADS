import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

function userFromResponse(data) {
  return data?.user || data?.data?.user || null;
}

function loginPayload(emailOrPayload, password) {
  if (typeof emailOrPayload === "object" && emailOrPayload !== null) {
    return emailOrPayload;
  }
  return { email: emailOrPayload, password };
}

function registerPayload(payloadOrEmail, password, metadata = {}) {
  if (typeof payloadOrEmail === "object" && payloadOrEmail !== null) {
    return payloadOrEmail;
  }
  return { email: payloadOrEmail, password, ...metadata };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const setAuthenticatedUser = useCallback((nextUser) => {
    setUser(nextUser);
    setSession(nextUser ? { user: nextUser } : null);
    return nextUser;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      return setAuthenticatedUser(userFromResponse(data));
    } catch {
      return setAuthenticatedUser(null);
    } finally {
      setLoading(false);
    }
  }, [setAuthenticatedUser]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (emailOrPayload, password) => {
    const data = await api.login(loginPayload(emailOrPayload, password));
    setAuthenticatedUser(userFromResponse(data));
    return data;
  }, [setAuthenticatedUser]);

  const register = useCallback(async (payloadOrEmail, password, metadata) => {
    const data = await api.register(registerPayload(payloadOrEmail, password, metadata));
    const nextUser = userFromResponse(data);
    if (nextUser) {
      setAuthenticatedUser(nextUser);
    }
    return data;
  }, [setAuthenticatedUser]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Local state still needs to clear if the network drops during logout.
    } finally {
      setAuthenticatedUser(null);
      window.location.assign("/login");
    }
  }, [setAuthenticatedUser]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signIn: login,
      register,
      signup: register,
      signUp: register,
      logout,
      signOut: logout,
      refreshUser,
    }),
    [user, session, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}

export default AuthContext;
