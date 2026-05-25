import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const AuthContext = createContext(null);

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  window.MY_TRUCKING_LEADS_API_BASE ||
  "";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest("/api/auth/me");

      const currentUser = data?.user || data || null;

      setUser(currentUser);
      setSession(currentUser ? { user: currentUser } : null);

      return currentUser;
    } catch {
      setUser(null);
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async ({ email, password }) => {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const loggedInUser = data?.user || data || null;

    setUser(loggedInUser);
    setSession(loggedInUser ? { user: loggedInUser } : null);

    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const registeredUser = data?.user || data || null;

    setUser(registeredUser);
    setSession(registeredUser ? { user: registeredUser } : null);

    return data;
  }, []);

  const signup = register;
  const signUp = register;

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      // Still clear local auth state even if logout endpoint fails.
    }

    setUser(null);
    setSession(null);
    window.location.href = "/login.html";
  }, []);

  const signOut = logout;

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      signup,
      signUp,
      logout,
      signOut,
      refreshUser,
    }),
    [user, session, loading, login, register, signup, logout, refreshUser]
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