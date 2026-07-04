import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
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

        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!text) return new Response("Missing text", { status: 400 });
        // Cap per request; the client should chunk long content.
        const input = text.slice(0, 3500);
        const voice = body.voice || "alloy";
        const speedRaw = typeof body.speed === "number" ? body.speed : 1.0;
        const speed = Math.min(4, Math.max(0.25, speedRaw));

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input,
            voice,
            speed,
            stream_format: "audio",
            response_format: "mp3",
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          return new Response(errText || "TTS failed", { status: upstream.status });
        }
        return new Response(upstream.body, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    },
  },
});
