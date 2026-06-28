import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { bootstrapAdmin } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppRouter,
});

function AppRouter() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();
  const bootstrap = useServerFn(bootstrapAdmin);

  useEffect(() => {
    if (loading || !user) return;
    // First user lands on this page → become admin if no admin exists.
    if (!role) {
      bootstrap()
        .then((r) => {
          if (r.promoted) {
            // Force role re-read
            window.location.replace("/dashboard");
          } else {
            navigate({ to: "/portal" });
          }
        })
        .catch(() => navigate({ to: "/portal" }));
      return;
    }
    if (role === "client") navigate({ to: "/portal" });
    else navigate({ to: "/dashboard" });
  }, [loading, role, user, navigate, bootstrap]);

  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-sm text-muted-foreground">Loading your workspace…</div>
    </div>
  );
}
