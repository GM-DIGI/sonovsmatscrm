import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = {
  id: string;
  body: string;
  sender_id: string;
  sender_kind: "client" | "agent" | "admin";
  created_at: string;
};

export function LeadMessenger({
  leadId,
  selfId,
  selfKind,
  className,
}: {
  leadId: string;
  selfId: string;
  selfKind: "client" | "agent" | "admin";
  className?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("lead_messages")
        .select("id,body,sender_id,sender_kind,created_at")
        .eq("lead_id", leadId)
        .order("created_at");
      if (mounted) setMsgs((data ?? []) as Msg[]);
    };
    load();
    const ch = supabase
      .channel(`lead-msgs-${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_messages", filter: `lead_id=eq.${leadId}` },
        (payload) => setMsgs((prev) => [...prev, payload.new as Msg]),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [leadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await supabase.from("lead_messages").insert({
      lead_id: leadId,
      sender_id: selfId,
      sender_kind: selfKind,
      body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInput("");
  };

  return (
    <div className={cn("flex h-full flex-col rounded-lg border border-border bg-card", className)}>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="space-y-3 p-4">
          {msgs.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Aucun message — démarrez la conversation.
            </div>
          )}
          {msgs.map((m) => {
            const mine = m.sender_id === selfId;
            return (
              <div key={m.id} className={cn("flex", mine && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {new Date(m.created_at).toLocaleString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                    {" · "}
                    {m.sender_kind === "client" ? "Client" : m.sender_kind === "admin" ? "Admin" : "Agent"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Votre message…"
          className="min-h-[40px] resize-none"
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
