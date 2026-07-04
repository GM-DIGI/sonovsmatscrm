import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let inbound: FormData;
        try {
          inbound = await request.formData();
        } catch {
          return new Response("Expected multipart/form-data", { status: 400 });
        }
        const file = inbound.get("file");
        if (!(file instanceof Blob) || file.size < 512) {
          return new Response("Enregistrement vide ou invalide", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        // Preserve container/extension so the provider can decode it.
        const type = file.type.split(";")[0] || "audio/webm";
        const ext =
          ({
            "audio/webm": "webm",
            "audio/mp4": "mp4",
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/x-wav": "wav",
            "audio/ogg": "ogg",
          } as Record<string, string>)[type] ?? "webm";
        upstream.append("file", file, `recording.${ext}`);

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        const bodyText = await res.text();
        if (!res.ok) {
          return new Response(bodyText || "Transcription failed", { status: res.status });
        }
        return new Response(bodyText, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
