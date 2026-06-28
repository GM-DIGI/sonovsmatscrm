import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export async function scoreLeadServer(leadId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("id,client_name,email,phone,budget,property_type,status,source,campaign,notes")
    .eq("id", leadId)
    .single();
  if (error || !lead) throw new Error(error?.message || "Lead introuvable");

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY manquant");

  const gateway = createLovableAiGatewayProvider(key);
  const { experimental_output } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    experimental_output: Output.object({
      schema: z.object({
        score: z.number().int().min(0).max(100),
        reason: z.string().max(280),
      }),
    }),
    system:
      "Tu es un expert en qualification de leads immobiliers. Évalue la qualité d'un prospect entre 0 (très froid) et 100 (très chaud, prêt à acheter). Considère : cohérence du budget avec le type de bien, présence de téléphone, source, intention exprimée dans les notes. Réponds en français.",
    prompt: `Lead à scorer :
Nom: ${lead.client_name}
Email: ${lead.email}
Téléphone: ${lead.phone ?? "—"}
Budget: ${lead.budget ?? "—"} €
Type: ${lead.property_type}
Statut actuel: ${lead.status}
Source: ${lead.source ?? "—"}
Campagne: ${lead.campaign ?? "—"}
Notes: ${lead.notes ?? "—"}`,
  });

  await supabaseAdmin
    .from("leads")
    .update({
      ai_score: experimental_output.score,
      ai_score_reason: experimental_output.reason,
      ai_scored_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  return experimental_output;
}

export const scoreLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify access: admin or assigned agent
    const { data: lead } = await context.supabase
      .from("leads")
      .select("id,assigned_agent_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead introuvable ou accès refusé");
    return scoreLeadServer(data.leadId);
  });
