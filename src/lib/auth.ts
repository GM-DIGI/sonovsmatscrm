import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "agent" | "client";

export interface AuthState {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });

  useEffect(() => {
    let mounted = true;

    const loadRole = async (user: User | null) => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!data || data.length === 0) return null;
      // priority: admin > agent > client
      const roles = data.map((r) => r.role as AppRole);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("agent")) return "agent";
      return "client";
    };

    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user ?? null;
      const role = await loadRole(user);
      if (mounted) setState({ user, role, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const user = session?.user ?? null;
      const role = await loadRole(user);
      if (mounted) setState({ user, role, loading: false });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
