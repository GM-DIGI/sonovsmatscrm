import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: due, error } = await supabaseAdmin
          .from("scheduled_reminders")
          .select("id,user_id,lead_id,channel,body,send_at")
          .eq("status", "pending")
          .lte("send_at", new Date().toISOString())
          .limit(100);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let processed = 0;
        for (const r of due ?? []) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("client_name")
            .eq("id", r.lead_id)
            .maybeSingle();

          const channelLabel = r.channel === "whatsapp" ? "WhatsApp" : "Email";
          await supabaseAdmin.from("notifications").insert({
            user_id: r.user_id,
            lead_id: r.lead_id,
            title: `Relance planifiée · ${channelLabel} · ${lead?.client_name ?? "Lead"}`,
            message: r.body.slice(0, 500),
          });

          await supabaseAdmin
            .from("scheduled_reminders")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", r.id);

          processed += 1;
        }

        return Response.json({ ok: true, processed });
      },
    },
  },
});
