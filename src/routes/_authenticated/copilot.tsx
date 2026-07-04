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
import { Loader2, Plus, Sparkles, Trash2, Send, Bot, Mail, MessageCircle, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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

function SendActions({ text }: { text: string }) {
  const [leads, setLeads] = useState<LeadContact[]>([]);
  const [open, setOpen] = useState<null | "wa" | "mail">(null);
  const [loaded, setLoaded] = useState(false);

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

  const send = (lead: LeadContact, kind: "wa" | "mail") => {
    const body = stripMarkdown(text);
    if (kind === "wa") {
      if (!lead.phone) {
        toast.error("Ce lead n'a pas de numéro");
        return;
      }
      const num = lead.phone.replace(/[^\d]/g, "");
      if (!num) {
        toast.error("Numéro invalide");
        return;
      }
      // wa.me opens WhatsApp app on mobile, WhatsApp Web on desktop
      openUrl(`https://wa.me/${num}?text=${encodeURIComponent(body)}`, true);
      toast.success(`WhatsApp ouvert pour ${lead.client_name}`);
    } else {
      if (!lead.email) {
        toast.error("Ce lead n'a pas d'email");
        return;
      }
      const subject = encodeURIComponent("Suivi de votre projet");
      // mailto must stay same-tab so the OS mail handler triggers
      openUrl(`mailto:${lead.email}?subject=${subject}&body=${encodeURIComponent(body)}`, false);
      toast.success(`Email préparé pour ${lead.client_name}`);
    }
    setOpen(null);
  };

  const renderPicker = (kind: "wa" | "mail") => (
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
  );

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Popover open={open === "wa"} onOpenChange={(o) => { setOpen(o ? "wa" : null); if (o) load(); }}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">{renderPicker("wa")}</PopoverContent>
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

      <form
        onSubmit={submit}
        className="border-t border-border bg-card/40 p-3"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
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
            placeholder="Posez votre question…"
            rows={1}
            className="min-h-[44px] resize-none"
          />
          <Button type="submit" disabled={busy || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </>
  );
}
