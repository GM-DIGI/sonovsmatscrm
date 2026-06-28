import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { LeadMessenger } from "@/components/LeadMessenger";
import { Loader2, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user, role } = useAuth();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("client_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLeadId(data?.id ?? null);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!leadId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Aucune conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre conseiller activera la messagerie dès la création de votre dossier.
        </p>
      </div>
    );
  }

  const senderKind: "admin" | "agent" | "client" =
    role === "admin" ? "admin" : role === "agent" ? "agent" : "client";

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3">
        <h1 className="text-xl font-semibold">Messagerie avec votre conseiller</h1>
        <p className="text-sm text-muted-foreground">Réponses en temps réel · historique conservé.</p>
      </div>
      <div className="flex-1">
        <LeadMessenger leadId={leadId} selfId={user!.id} selfKind={senderKind} />
      </div>
    </div>
  );
}
