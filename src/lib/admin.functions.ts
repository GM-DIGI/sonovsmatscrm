import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Bootstrap: if no admin exists yet, promote the calling user to admin.
 * After the first admin exists this is a no-op.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { promoted: false };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { promoted: true };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "agent", "client"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "agent", "client"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at")
      .order("created_at", { ascending: false });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
    }));
  });

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(120),
        password: z.string().min(8).max(72).optional(),
        role: z.enum(["admin", "agent"]),
        sendInvite: z.boolean().optional(),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    let userId: string;
    let invited = false;

    if (data.sendInvite) {
      const { data: inv, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        { data: { name: data.name }, redirectTo: data.redirectTo },
      );
      if (invErr || !inv.user) throw new Error(invErr?.message ?? "Envoi de l'invitation impossible");
      userId = inv.user.id;
      invited = true;
    } else {
      if (!data.password) throw new Error("Mot de passe requis");
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name },
      });
      if (createErr || !created.user) throw new Error(createErr?.message ?? "Création impossible");
      userId = created.user.id;
    }

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, name: data.name, email: data.email }, { onConflict: "id" });

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr && !roleErr.message.includes("duplicate")) throw new Error(roleErr.message);

    return { ok: true, userId, invited };
  });

/**
 * Invite the client of a given lead by email. Creates a Supabase auth user (unconfirmed)
 * and sends the invitation email. The handle_new_user trigger will link the lead and
 * assign the 'client' role on signup. Allowed for admins and the assigned agent.
 */
export const inviteClientForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, email, client_name, assigned_agent_id, client_user_id")
      .eq("id", data.leadId)
      .single();
    if (leadErr || !lead) throw new Error("Lead introuvable");
    if (!lead.email) throw new Error("Ce lead n'a pas d'adresse e-mail");
    if (lead.client_user_id) throw new Error("Un compte client est déjà rattaché à ce lead");

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin && lead.assigned_agent_id !== context.userId) throw new Error("Forbidden");

    const { data: inv, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      lead.email,
      { data: { name: lead.client_name } },
    );
    if (invErr || !inv.user) throw new Error(invErr?.message ?? "Envoi de l'invitation impossible");

    // Pre-link the lead and grant client role immediately (trigger only fires on signup;
    // here the user is created via invite so we wire it up now).
    await supabaseAdmin.from("leads").update({ client_user_id: inv.user.id }).eq("id", lead.id);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: inv.user.id, role: "client" })
      .then((r) => {
        if (r.error && !r.error.message.includes("duplicate")) throw new Error(r.error.message);
      });
    await supabaseAdmin.from("lead_activities").insert({
      lead_id: lead.id,
      kind: "system",
      message: `Invitation client envoyée à ${lead.email}`,
      author_id: context.userId,
    });

    return { ok: true, email: lead.email };
  });
