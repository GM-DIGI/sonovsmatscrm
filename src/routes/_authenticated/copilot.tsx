import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Sparkles, Trash2, Send, Bot, Mail, MessageCircle, Clock, X, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { WavRecorder } from "@/lib/wav-recorder";

type LeadContact = { id: string; client_name: string; email: string | null; phone: string | null };

function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
}

// Country dial codes → expected total E.164 length range (cc + national)
const CC_LENGTHS: Record<string, [number, number]> = {
  "1": [11, 11],   // US/CA
  "33": [11, 11],  // France
  "32": [11, 11],  // Belgium
  "41": [11, 11],  // Switzerland
  "44": [12, 13],  // UK
  "212": [12, 12], // Morocco
  "213": [12, 12], // Algeria
  "216": [11, 11], // Tunisia
  "221": [12, 12], // Senegal
  "223": [11, 11], // Mali
  "224": [12, 12], // Guinea
  "225": [13, 13], // Côte d'Ivoire (10 digits national)
  "226": [11, 11], // Burkina Faso
  "227": [11, 11], // Niger
  "228": [11, 11], // Togo
  "229": [11, 11], // Benin
  "233": [12, 12], // Ghana
  "234": [13, 14], // Nigeria
  "237": [12, 12], // Cameroon
  "241": [11, 11], // Gabon
  "242": [12, 12], // Congo
  "243": [12, 12], // DRC
};

type NormalizeResult =
  | { ok: true; e164: string; cc: string }
  | { ok: false; reason: string };

function normalizePhone(raw: string, defaultCc: string): NormalizeResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "Numéro vide" };
  const trimmed = raw.trim();
  const hasInternational = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("00")) digits = digits.replace(/^00/, "");
  if (!digits) return { ok: false, reason: "Numéro sans chiffres" };

  let cc: string | null = null;
  if (hasInternational) {
    // Detect country code (longest match wins)
    const codes = Object.keys(CC_LENGTHS).sort((a, b) => b.length - a.length);
    cc = codes.find((c) => digits.startsWith(c)) ?? null;
  } else {
    digits = digits.replace(/^0+/, "");
    cc = defaultCc.replace(/[^\d]/g, "") || null;
    if (!cc) return { ok: false, reason: "Indicatif pays manquant" };
    digits = `${cc}${digits}`;
  }

  if (digits.length < 8) return { ok: false, reason: "Numéro trop court" };
  if (digits.length > 15) return { ok: false, reason: "Numéro trop long (>15 chiffres E.164)" };
  if (/^0/.test(digits)) return { ok: false, reason: "Ne peut pas commencer par 0" };

  if (cc && CC_LENGTHS[cc]) {
    const [min, max] = CC_LENGTHS[cc];
    if (digits.length < min || digits.length > max) {
      return {
        ok: false,
        reason: `Longueur invalide pour +${cc} (attendu ${min === max ? min : `${min}–${max}`} chiffres)`,
      };
    }
  }

  return { ok: true, e164: digits, cc: cc ?? "" };
}

type EmailResult = { ok: true; email: string } | { ok: false; reason: string };

function normalizeEmail(raw: string): EmailResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "Email vide" };
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return { ok: false, reason: "Email trop long (>254)" };
  // RFC-5322 pragmatic regex
  const re = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!re.test(email)) return { ok: false, reason: "Format invalide" };
  const [local, domain] = email.split("@");
  if (local.length > 64) return { ok: false, reason: "Partie locale trop longue" };
  if (local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return { ok: false, reason: "Points invalides dans la partie locale" };
  if (!domain.includes(".")) return { ok: false, reason: "Domaine sans extension" };
  const tld = domain.split(".").pop() || "";
  if (tld.length < 2) return { ok: false, reason: "Extension de domaine trop courte" };
  return { ok: true, email };
}


function SendActions({ text }: { text: string }) {
  const [leads, setLeads] = useState<LeadContact[]>([]);
  const [open, setOpen] = useState<null | "wa" | "mail">(null);
  const [loaded, setLoaded] = useState(false);
  const [countryCode, setCountryCode] = useState<string>(() => {
    if (typeof window === "undefined") return "225";
    return window.localStorage.getItem("sonov.defaultCc") || "225";
  });

  const saveCc = (v: string) => {
    setCountryCode(v);
    try { window.localStorage.setItem("sonov.defaultCc", v); } catch {}
  };

  const load = async () => {
    if (loaded) return;
    const { data } = await supabase
      .from("leads")
      .select("id,client_name,email,phone")
      .order("updated_at", { ascending: false })
      .limit(100);
    setLeads(data ?? []);
    setLoaded(true);
  };

  const openUrl = (url: string, newTab: boolean) => {
    const a = document.createElement("a");
    a.href = url;
    if (newTab) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const send = async (lead: LeadContact, kind: "wa" | "mail") => {
    const body = stripMarkdown(text);
    if (kind === "wa") {
      if (!lead.phone) {
        toast.error("Ce lead n'a pas de numéro");
        return;
      }
      const res = normalizePhone(lead.phone, countryCode);
      if (!res.ok) {
        toast.error(`Numéro invalide : ${res.reason}`);
        return;
      }
      // wa.me expects the phone in E.164 without the leading '+'.
      // res.e164 is already digits-only after normalization.
      const waLink = `https://wa.me/${res.e164}?text=${encodeURIComponent(body)}`;
      const appFallback = `whatsapp://send?phone=${res.e164}&text=${encodeURIComponent(body)}`;
      openUrl(waLink, true);
      try { await navigator.clipboard.writeText(body); } catch {}
      toast.success(`WhatsApp ouvert pour ${lead.client_name} (+${res.cc})`, {
        description: "Message copié. Si le lien est bloqué, ouvrez l'app WhatsApp.",
        action: {
          label: "Ouvrir l'app",
          onClick: () => openUrl(appFallback, false),
        },
      });


    } else {
      if (!lead.email) {
        toast.error("Ce lead n'a pas d'email");
        return;
      }
      const res = normalizeEmail(lead.email);
      if (!res.ok) {
        toast.error(`Email invalide : ${res.reason}`);
        return;
      }
      const subject = "Suivi de votre projet";
      const mailto = `mailto:${res.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const outlookWeb = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(res.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      // Native mail client first (works even when Gmail/Outlook web are blocked by the network)
      openUrl(mailto, false);
      const full = `À: ${res.email}\nSujet: ${subject}\n\n${body}`;
      try { await navigator.clipboard.writeText(full); } catch {}
      toast.success(`Email prêt pour ${lead.client_name}`, {
        description: "Message copié (destinataire + sujet + corps). Si aucun client mail ne s'ouvre, utilisez Outlook web.",
        action: {
          label: "Outlook web",
          onClick: () => openUrl(outlookWeb, true),
        },
      });
    }

    setOpen(null);
  };

  const renderPicker = (kind: "wa" | "mail") => (
    <div>
      {kind === "wa" && (
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Label className="text-xs shrink-0">Indicatif</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">+</span>
            <Input
              value={countryCode}
              onChange={(e) => saveCc(e.target.value.replace(/[^\d]/g, ""))}
              className="h-7 w-16 text-xs"
              placeholder="225"
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            appliqué si numéro sans +
          </span>
        </div>
      )}
      <Command>
        <CommandInput placeholder="Rechercher un lead…" />
        <CommandList>
          <CommandEmpty>Aucun lead</CommandEmpty>
          <CommandGroup>
            {leads
              .filter((l) => (kind === "wa" ? l.phone : l.email))
              .map((l) => (
                <CommandItem key={l.id} value={l.client_name} onSelect={() => send(l, kind)}>
                  <div className="flex flex-col">
                    <span>{l.client_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {kind === "wa" ? l.phone : l.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Popover open={open === "wa"} onOpenChange={(o) => { setOpen(o ? "wa" : null); if (o) load(); }}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">{renderPicker("wa")}</PopoverContent>
      </Popover>
      <Popover open={open === "mail"} onOpenChange={(o) => { setOpen(o ? "mail" : null); if (o) load(); }}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <Mail className="mr-1 h-3.5 w-3.5" /> Email
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">{renderPicker("mail")}</PopoverContent>
      </Popover>
      <ScheduleAction text={text} onLoadLeads={load} leads={leads} />
    </div>
  );
}


function ScheduleAction({
  text,
  leads,
  onLoadLeads,
}: {
  text: string;
  leads: LeadContact[];
  onLoadLeads: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState<string>("");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const defaultWhen = () => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [when, setWhen] = useState<string>(defaultWhen());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!leadId) return toast.error("Choisissez un lead");
    const iso = new Date(when).toISOString();
    if (Number.isNaN(new Date(when).getTime())) return toast.error("Date invalide");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { setSaving(false); return toast.error("Session expirée"); }
    const { error } = await supabase.from("scheduled_reminders").insert({
      user_id: userRes.user.id,
      lead_id: leadId,
      channel,
      body: stripMarkdown(text),
      send_at: iso,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Relance planifiée");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) onLoadLeads(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Clock className="mr-1 h-3.5 w-3.5" /> Planifier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="space-y-1.5">
          <Label className="text-xs">Lead</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>{l.client_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Canal</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={channel === "whatsapp" ? "default" : "outline"}
              className="h-8 flex-1 text-xs"
              onClick={() => setChannel("whatsapp")}
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button
              type="button"
              size="sm"
              variant={channel === "email" ? "default" : "outline"}
              className="h-8 flex-1 text-xs"
              onClick={() => setChannel("email")}
            >
              <Mail className="mr-1 h-3.5 w-3.5" /> Email
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date & heure</Label>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-9"
          />
        </div>
        <Button onClick={submit} disabled={saving} className="w-full" size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Planifier la relance"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export const Route = createFileRoute("/_authenticated/copilot")({
  head: () => ({ meta: [{ title: "Copilote IA · SONOV" }] }),
  component: CopilotPage,
});

type Thread = { id: string; title: string; updated_at: string };

function CopilotPage() {
  const { role, user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Load threads
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("chat_threads")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false });
      setThreads(data ?? []);
      if (!activeId && data && data.length > 0) setActiveId(data[0].id);
    };
    load();
  }, [user]);

  // Load messages for active thread
  useEffect(() => {
    if (!activeId) {
      setInitialMessages([]);
      return;
    }
    setLoadingMsgs(true);
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id,role,parts,created_at")
        .eq("thread_id", activeId)
        .order("created_at");
      setInitialMessages(
        (data ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts: (m.parts as unknown) as UIMessage["parts"],
        })),
      );
      setLoadingMsgs(false);
    })();
  }, [activeId]);

  const newThread = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: user.id, title: "Nouvelle conversation" })
      .select("id,title,updated_at")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setThreads((t) => [data, ...t]);
    setActiveId(data.id);
  };

  const deleteThread = async (id: string) => {
    await supabase.from("chat_threads").delete().eq("id", id);
    setThreads((t) => t.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <AppShell role={role}>
      <div className="flex h-[calc(100vh-3.5rem)]">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card/40 md:flex md:flex-col">
          <div className="p-3">
            <Button onClick={newThread} className="w-full" size="sm">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle conversation
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    activeId === t.id && "bg-muted font-medium",
                  )}
                >
                  <button
                    onClick={() => setActiveId(t.id)}
                    className="flex-1 truncate text-left"
                  >
                    {t.title}
                  </button>
                  <button
                    onClick={() => deleteThread(t.id)}
                    className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {threads.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Aucune conversation
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {activeId ? (
            <ChatPane key={activeId} threadId={activeId} initialMessages={initialMessages} loading={loadingMsgs} />
          ) : (
            <EmptyState onNew={newThread} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand text-white">
        <Bot className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">SONOV Copilot</h2>
        <p className="text-sm text-muted-foreground">
          Demandez un résumé de pipeline, une priorité, ou rédigez une relance.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="mr-2 h-4 w-4" /> Démarrer
      </Button>
    </div>
  );
}

function ChatPane({
  threadId,
  initialMessages,
  loading,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  loading: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Voice assistant state ────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<string>(() => localStorage.getItem("copilot.voice") ?? "alloy");
  const [speed, setSpeed] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("copilot.voiceSpeed") ?? "1");
    return Number.isFinite(v) ? v : 1;
  });
  const [testingVoice, setTestingVoice] = useState(false);
  const recorderRef = useRef<WavRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => { localStorage.setItem("copilot.voice", voice); }, [voice]);
  useEffect(() => { localStorage.setItem("copilot.voiceSpeed", String(speed)); }, [speed]);

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async ({ messages, id }) => {
        const { data } = await supabase.auth.getSession();
        return {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session?.access_token ?? ""}`,
          },
          body: { messages, threadId: id },
        };
      },
    }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    sendMessage({ text });
    setInput("");
  };

  const busy = status === "submitted" || status === "streaming";

  // ── Voice: record → transcribe → send ────────────────────────────────────
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Micro non disponible dans ce navigateur");
        return;
      }
      const rec = new WavRecorder();
      rec.onLevel = (l) => setMicLevel(l);
      try {
        await rec.start();
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          toast.error("Micro refusé — autorisez l'accès dans le navigateur");
        } else if (name === "NotFoundError") {
          toast.error("Aucun micro détecté");
        } else {
          toast.error(`Micro : ${err instanceof Error ? err.message : "échec"}`);
        }
        return;
      }
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      toast.error(`Micro : ${err instanceof Error ? err.message : "échec"}`);
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) {
      setRecording(false);
      return;
    }
    setRecording(false);
    const peak = rec.getPeak();
    let blob: Blob;
    try {
      blob = await rec.stop();
    } catch (err) {
      toast.error(`Enregistrement : ${err instanceof Error ? err.message : "échec"}`);
      return;
    } finally {
      recorderRef.current = null;
      setMicLevel(0);
    }
    if (blob.size < 2048) {
      toast.error("Enregistrement trop court — parlez plus longtemps");
      return;
    }
    if (peak < 0.01) {
      toast.error("Micro silencieux — vérifiez l'entrée audio de votre système (aucun son détecté)");
      return;
    }
    setTranscribing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Session expirée — reconnectez-vous");
        return;
      }
      const fd = new FormData();
      fd.append("file", blob, "recording.wav");
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(bodyText || `HTTP ${res.status}`);
      }
      let text = "";
      try {
        text = ((JSON.parse(bodyText) as { text?: string }).text ?? "").trim();
      } catch {
        text = bodyText.trim();
      }
      if (!text) {
        toast.error("Aucun texte détecté");
        return;
      }
      if (voiceOn) {
        sendMessage({ text });
      } else {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        textareaRef.current?.focus();
      }
    } catch (err) {
      toast.error(`Transcription : ${err instanceof Error ? err.message : "échec"}`);
    } finally {
      setTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (recording) void stopRecording();
    else void startRecording();
  };


  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
  };

  const speak = async (text: string) => {
    stopSpeaking();
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ text, voice, speed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      setSpeaking(true);
      await audio.play();
    } catch (err) {
      setSpeaking(false);
      toast.error(`Voix : ${err instanceof Error ? err.message : "échec"}`);
    }
  };

  // Auto-play the last assistant message once streaming finishes, if voice mode is on.
  useEffect(() => {
    if (!voiceOn || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastSpokenIdRef.current === last.id) return;
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    if (!text) return;
    lastSpokenIdRef.current = last.id;
    void speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, voiceOn]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);


  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {loading && (
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </div>
          )}
          {messages.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" />
              Essayez : « Quels leads dois-je relancer en priorité ? » ou
              « Rédige un email de relance pour mes leads à l'étape Offer Made ».
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={cn("flex gap-3", isUser && "justify-end")}>
                {!isUser && (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-brand text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground border border-border",
                  )}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{text}</div>
                  ) : (
                    <>
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-pre:my-2">
                        <ReactMarkdown>{text || " "}</ReactMarkdown>
                      </div>
                      {text.trim() && status !== "streaming" && <SendActions text={text} />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {status === "submitted" && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-brand text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Réflexion…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-card/40 px-3 pt-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 pb-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            <span>Voix</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
            >
              {[
                { v: "alloy", label: "Alloy (neutre)" },
                { v: "ash", label: "Ash (chaleureux)" },
                { v: "ballad", label: "Ballad (posé)" },
                { v: "coral", label: "Coral (clair)" },
                { v: "echo", label: "Echo (masculin)" },
                { v: "fable", label: "Fable (narratif)" },
                { v: "nova", label: "Nova (féminin)" },
                { v: "onyx", label: "Onyx (grave)" },
                { v: "sage", label: "Sage (calme)" },
                { v: "shimmer", label: "Shimmer (doux)" },
                { v: "verse", label: "Verse (expressif)" },
              ].map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span>Vitesse</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="h-1 w-28 accent-primary"
            />
            <span className="w-10 tabular-nums text-foreground">{speed.toFixed(2)}×</span>
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={testingVoice}
            onClick={async () => {
              setTestingVoice(true);
              try {
                await speak("Bonjour, je suis votre copilote SONOV. Cette voix vous convient-elle ?");
              } finally {
                setTestingVoice(false);
              }
            }}
          >
            {testingVoice ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Volume2 className="mr-1 h-3 w-3" />}
            Tester
          </Button>
          {speaking && (
            <button type="button" onClick={stopSpeaking} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:text-foreground">
              <Square className="h-3 w-3" /> Stop
            </button>
          )}
        </div>
      </div>

      <form
        onSubmit={submit}
        className="border-t border-border bg-card/40 p-3"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Button
            type="button"
            variant={voiceOn ? "default" : "outline"}
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn((v) => !v);
            }}
            title={voiceOn ? "Voix activée (cliquer pour couper)" : "Activer la lecture vocale"}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant={recording ? "destructive" : "outline"}
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={toggleRecording}
            disabled={transcribing || busy}
            title={recording ? "Arrêter l'enregistrement" : "Parler"}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : recording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={recording ? "🎙️ Enregistrement en cours…" : "Posez votre question ou parlez…"}
            rows={1}
            className="min-h-[44px] resize-none"
          />
          {speaking && (
            <Button
              type="button"
              onClick={stopSpeaking}
              variant="destructive"
              className="h-11 shrink-0 gap-1.5"
              title="Interrompre la lecture vocale"
              aria-label="Stop lecture vocale"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop
            </Button>
          )}
          <Button type="submit" disabled={busy || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {(recording || speaking) && (
          <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2 text-xs text-muted-foreground">
            {recording && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                Enregistrement…
              </span>
            )}
            {speaking && (
              <button type="button" onClick={stopSpeaking} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Volume2 className="h-3 w-3" /> L'assistant parle — cliquer pour couper
              </button>
            )}
          </div>
        )}
      </form>
    </>
  );
}
