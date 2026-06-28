import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
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
  const { text } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system:
      "Tu es un expert en qualification de leads immobiliers. Tu réponds STRICTEMENT en JSON valide au format {\"score\": <int 0-100>, \"reason\": \"<phrase courte en français, max 200 caractères>\"}. Le score reflète la qualité du lead : cohérence budget/type, présence téléphone, intention dans les notes, source.",
    prompt: `Évalue ce lead et réponds en JSON uniquement :
Nom: ${lead.client_name}
Email: ${lead.email}
Téléphone: ${lead.phone ?? "—"}
Budget: ${lead.budget ?? "—"} €
Type: ${lead.property_type}
Statut: ${lead.status}
Source: ${lead.source ?? "—"}
Campagne: ${lead.campaign ?? "—"}
Notes: ${lead.notes ?? "—"}`,
  });

  // Tolérant : extrait le premier objet JSON du texte
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse IA invalide");
  const parsed = z
    .object({ score: z.number().int().min(0).max(100), reason: z.string().max(300) })
    .parse(JSON.parse(match[0]));

  await supabaseAdmin
    .from("leads")
    .update({
      ai_score: parsed.score,
      ai_score_reason: parsed.reason,
      ai_scored_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  return parsed;
}

export const scoreLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead } = await context.supabase
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead introuvable ou accès refusé");
    return scoreLeadServer(data.leadId);
  });

