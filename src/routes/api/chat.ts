import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        let body: { messages?: UIMessage[]; threadId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = body.messages;
        const threadId = body.threadId;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("Bad request", { status: 400 });
        }

        // Verify thread ownership
        const { data: thread } = await supabaseAdmin
          .from("chat_threads")
          .select("id,user_id,title")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread || thread.user_id !== userId) {
          return new Response("Forbidden", { status: 403 });
        }

        // Persist the last user message (the new one)
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
          await supabaseAdmin.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            parts: lastUserMsg.parts as never,
          });
          if (thread.title === "Nouvelle conversation") {
            const firstText =
              (lastUserMsg.parts ?? [])
                .map((p) => (p.type === "text" ? p.text : ""))
                .join(" ")
                .trim()
                .slice(0, 60) || "Nouvelle conversation";
            await supabaseAdmin
              .from("chat_threads")
              .update({ title: firstText })
              .eq("id", threadId);
          }
        }

        // Build context: recent leads accessible to this user
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        const isAdmin = roleRow?.role === "admin";
        let leadsQ = supabaseAdmin
          .from("leads")
          .select("client_name,status,property_type,budget,ai_score,ai_score_reason,assigned_agent_id")
          .order("updated_at", { ascending: false })
          .limit(40);
        if (!isAdmin) leadsQ = leadsQ.eq("assigned_agent_id", userId);
        const { data: leads } = await leadsQ;
        const leadsCtx =
          (leads ?? [])
            .map(
              (l, i) =>
                `${i + 1}. ${l.client_name} — ${l.property_type} — budget ${l.budget ?? "?"} € — statut ${l.status}${l.ai_score != null ? ` — score IA ${l.ai_score}` : ""}`,
            )
            .join("\n") || "(aucun lead)";

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: `Tu es Atrium Copilot, l'assistant IA d'un CRM immobilier français. Réponds en français, en markdown, avec concision. Tu aides l'utilisateur (rôle ${roleRow?.role ?? "agent"}) à prioriser ses leads, rédiger des messages clients, résumer les dossiers et suggérer la prochaine action. Voici un extrait des leads ${isAdmin ? "de l'agence" : "de cet agent"} :\n${leadsCtx}`,
          messages: convertToModelMessages(messages),
          onFinish: async ({ text }) => {
            await supabaseAdmin.from("chat_messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              parts: [{ type: "text", text }] as never,
            });
            await supabaseAdmin
              .from("chat_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
