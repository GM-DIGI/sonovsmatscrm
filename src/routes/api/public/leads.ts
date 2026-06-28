import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const PROPERTY_TYPES = [
  "Appartement",
  "Studio",
  "Villa",
  "Maison",
  "Bureau",
  "Local commercial",
  "Terrain",
] as const;

const schema = z.object({
  client_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  budget: z.union([z.number(), z.string()]).optional().nullable(),
  property_type: z.enum(PROPERTY_TYPES).default("Appartement"),
  campaign: z.string().trim().max(120).optional().or(z.literal("")),
  source: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Validation failed", details: parsed.error.flatten() }),
            { status: 400, headers: { "Content-Type": "application/json", ...cors } },
          );
        }
        const d = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Round-robin: pick the agent with the fewest open leads
        const { data: agents } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "agent");

        let assigned_agent_id: string | null = null;
        if (agents && agents.length > 0) {
          const counts = await Promise.all(
            agents.map(async (a) => {
              const { count } = await supabaseAdmin
                .from("leads")
                .select("id", { count: "exact", head: true })
                .eq("assigned_agent_id", a.user_id)
                .neq("status", "Signed & Closed");
              return { id: a.user_id, n: count ?? 0 };
            }),
          );
          counts.sort((a, b) => a.n - b.n);
          assigned_agent_id = counts[0].id;
        }

        const budgetNum =
          d.budget === undefined || d.budget === null || d.budget === ""
            ? null
            : Number(d.budget);

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            client_name: d.client_name,
            email: d.email.toLowerCase(),
            phone: d.phone || null,
            budget: Number.isFinite(budgetNum as number) ? (budgetNum as number) : null,
            property_type: d.property_type,
            status: "New",
            assigned_agent_id,
            source: d.source || "Formulaire campagne",
            campaign: d.campaign || null,
            notes: d.notes || null,
          })
          .select("id")
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }

        await supabaseAdmin.from("lead_activities").insert({
          lead_id: lead.id,
          kind: "system",
          message: `Lead créé via ${d.source || "Formulaire campagne"}${d.campaign ? ` — campagne « ${d.campaign} »` : ""}.`,
        });

        if (assigned_agent_id) {
          await supabaseAdmin.from("notifications").insert({
            user_id: assigned_agent_id,
            lead_id: lead.id,
            title: "Nouveau lead entrant",
            message: `${d.client_name} (${d.email})${d.campaign ? ` — ${d.campaign}` : ""}`,
          });
        }

        return new Response(JSON.stringify({ ok: true, id: lead.id }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
});
