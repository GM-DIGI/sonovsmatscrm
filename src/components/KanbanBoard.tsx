import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Building2, Lock, FileCheck, AlertCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { STATUSES, statusIndex, fmtMoney, type LeadStatus, REQUIRED_DOCS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Lead = Tables<"leads">;

interface Props {
  leads: Lead[];
  docCounts: Record<string, { approved: number; total: number; required: number }>;
  onOpen: (l: Lead) => void;
  onStatusChange: (l: Lead, status: LeadStatus) => Promise<void>;
}

const columnTint = [
  "from-slate-100 to-slate-50",
  "from-blue-50 to-slate-50",
  "from-indigo-50 to-slate-50",
  "from-violet-50 to-slate-50",
  "from-amber-50 to-slate-50",
  "from-emerald-50 to-slate-50",
];

export function KanbanBoard({ leads, docCounts, onOpen, onStatusChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [active, setActive] = useState<Lead | null>(null);
  const columns = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {} as never;
    STATUSES.forEach((s) => (map[s] = []));
    for (const l of leads) map[l.status as LeadStatus]?.push(l);
    return map;
  }, [leads]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const id = e.active.id as string;
    const newStatus = e.over?.id as LeadStatus | undefined;
    if (!newStatus) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === newStatus) return;
    if (lead.locked) {
      toast.error("This lead is locked — no further changes allowed.");
      return;
    }
    await onStatusChange(lead, newStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActive(leads.find((l) => l.id === e.active.id) ?? null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status, i) => (
          <Column
            key={status}
            status={status}
            tint={columnTint[i]}
            leads={columns[status] ?? []}
            docCounts={docCounts}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {active && <LeadCard lead={active} docCounts={docCounts} dragging />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  leads,
  docCounts,
  onOpen,
  tint,
}: {
  status: LeadStatus;
  leads: Lead[];
  docCounts: Props["docCounts"];
  onOpen: Props["onOpen"];
  tint: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-border bg-gradient-to-b",
        tint,
        isOver && "ring-2 ring-[color:var(--accent)]",
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "Signed & Closed"
                ? "bg-[color:var(--success)]"
                : status === "Contract Pending"
                ? "bg-amber-500"
                : "bg-[color:var(--primary)]",
            )}
          />
          <h3 className="text-sm font-semibold tracking-tight">{status}</h3>
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {leads.length === 0 && (
          <div className="grid h-20 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Drop leads here
          </div>
        )}
        {leads.map((l) => (
          <button key={l.id} className="text-left" onClick={() => onOpen(l)}>
            <DraggableLead lead={l} docCounts={docCounts} />
          </button>
        ))}
      </div>
    </div>
  );
}

function DraggableLead({ lead, docCounts }: { lead: Lead; docCounts: Props["docCounts"] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-30")}
    >
      <LeadCard lead={lead} docCounts={docCounts} />
    </div>
  );
}

function LeadCard({
  lead,
  docCounts,
  dragging,
}: {
  lead: Lead;
  docCounts: Props["docCounts"];
  dragging?: boolean;
}) {
  const counts = docCounts[lead.id] ?? { approved: 0, total: 0, required: REQUIRED_DOCS.length };
  const reqMet = counts.approved >= counts.required;
  const progressPct = ((statusIndex(lead.status) + 1) / STATUSES.length) * 100;
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm transition",
        dragging && "shadow-elevated rotate-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{lead.client_name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            {lead.property_type}
          </div>
        </div>
        {lead.locked && (
          <span title="Locked" className="rounded-full bg-[color:var(--success)]/15 p-1 text-[color:var(--success)]">
            <Lock className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[color:var(--accent)]">
          {fmtMoney(lead.budget)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            reqMet
              ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {reqMet ? <FileCheck className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {counts.approved}/{counts.required} docs
        </span>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${progressPct}%` }} />
      </div>
    </motion.div>
  );
}
