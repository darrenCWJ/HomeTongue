import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isConfigured } from "../lib/supabase";

export type AdminGate = "loading" | "signed-out" | "not-admin" | "admin";

export interface AdminSessionState {
  gate: AdminGate;
  userId: string | null;
  userEmail: string | null;
  signOut: () => Promise<void>;
}

/**
 * Tracks the Supabase auth session and resolves the admin gate:
 * signed-out → sign-in screen; signed-in → fetch own profiles row and require
 * is_admin === true (RLS enforces the same server-side via public.is_admin()).
 */
export function useAdminSession(): AdminSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<AdminGate>("loading");

  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabase();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (!data.session) setGate("signed-out");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setGate("signed-out");
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!isConfigured || !userId) return;
    let cancelled = false;
    setGate("loading");

    void getSupabase()
      .from("profiles")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load profile for admin check:", error.message);
          setGate("not-admin");
          return;
        }
        const row = data as { is_admin?: boolean | null } | null;
        setGate(row?.is_admin === true ? "admin" : "not-admin");
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  return {
    gate,
    userId,
    userEmail: session?.user?.email ?? null,
    signOut,
  };
}
