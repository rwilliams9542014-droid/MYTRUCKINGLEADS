import { createContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const AuthContext = createContext(null);

const DEMO_USER = {
  id: "demo-user-001",
  email: "demo@mytruckingleads.com",
  user_metadata: { full_name: "Demo Agent", agency_name: "Demo Insurance Agency", plan: "pro" },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const savedDemo = sessionStorage.getItem("mtl_demo");
    if (savedDemo) {
      setUser(DEMO_USER);
      setSession({ user: DEMO_USER });
      setIsDemo(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  function demoSignIn() {
    sessionStorage.setItem("mtl_demo", "true");
    setUser(DEMO_USER);
    setSession({ user: DEMO_USER });
    setIsDemo(true);
  }

  async function signUp(email, password, metadata = {}) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    sessionStorage.removeItem("mtl_demo");
    if (!isDemo) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setUser(null);
    setSession(null);
    setIsDemo(false);
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isDemo, signIn, signUp, signOut, demoSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}
