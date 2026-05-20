// Session 58.2-overnight Task 3 — drag-and-drop reorder for
// /admin/donation-packages.
//
// Built on @dnd-kit/sortable. One section per package_type; drags
// are constrained to the section's own SortableContext so the user
// can't accidentally drag a monthly card into the one-time bucket.
//
// On drop:
//   1. Optimistically reorder local state so the UI never feels
//      laggy
//   2. POST /api/admin/donation-packages/reorder with the new
//      [{id, display_order}] for the affected section
//   3. On failure, revert to the server's canonical order via
//      router.refresh() (which re-runs the server component and
//      re-seeds the props)
//
// The manual `display_order` number input on the edit page remains
// as a keyboard-accessible fallback.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SortableRow {
  id: string;
  name_en: string;
  description_en: string;
  amount_bdt: number;
  display_order: number;
  is_active: boolean;
  duration_months: number | null;
  cause_tag: string | null;
  /** Session 58.3 — surfaced as a small badge in the list row. */
  package_subtype: string | null;
}

interface Props {
  title: string;
  rows: ReadonlyArray<SortableRow>;
}

export function SortableDonationPackageList({ title, rows }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<SortableRow[]>(() => [...rows]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Don't trigger a drag from a card-row click — the row also
      // wraps an edit link. 5px movement before drag activates.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((r) => r.id === active.id);
    const newIndex = order.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(order, oldIndex, newIndex);
    // Renumber 1..N within this section so display_order stays
    // dense (the seed convention).
    const renumbered = next.map((r, i) => ({ ...r, display_order: i + 1 }));
    setOrder(renumbered);
    setError(null);

    // Fire the bulk update. Optimistic — UI already reflects the
    // new order. On failure we revert via router.refresh().
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/donation-packages/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: renumbered.map((r) => ({
              id: r.id,
              display_order: r.display_order,
            })),
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { message?: string; error?: string }
            | null;
          setError(json?.message || json?.error || "Reorder failed");
          // Revert to canonical order from the server.
          router.refresh();
          return;
        }
        // Refresh so any cascading effects (e.g. list refetches) are
        // reflected. Not strictly required because we already applied
        // optimistic state.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        router.refresh();
      }
    });
  }

  return (
    <div className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          {title}
        </h2>
        {isPending ? (
          <span className="text-[11px] text-ink-soft">Saving order…</span>
        ) : null}
      </div>
      {error ? (
        <p className="mb-2 text-[13px] text-rose-700">{error}</p>
      ) : null}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 overflow-hidden">
        {order.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px] text-ink-soft italic">
            No {title.toLowerCase()} packages yet.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={order.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-stone-100">
                {order.map((r) => (
                  <SortableItem key={r.id} row={r} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableItem({ row }: { row: SortableRow }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : row.is_active ? 1 : 0.55,
    background: isDragging ? "#fffaf2" : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`px-2 py-3 ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="touch-none cursor-grab p-1 text-slate-soft hover:text-tangerine active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Link
          href={`/admin/donation-packages/${row.id}`}
          className="flex flex-1 items-center gap-4 px-2"
        >
          <span className="font-mono text-[11px] text-slate w-6 text-right shrink-0">
            {row.display_order}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium text-ink truncate">
              {row.name_en}
              {row.package_subtype === "one_time_quick" ? (
                <span className="ml-2 rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-normal text-sky-deep">
                  quick
                </span>
              ) : null}
              {row.package_subtype === "one_time_gift" ? (
                <span className="ml-2 rounded-full bg-moss-soft/50 px-2 py-0.5 text-[11px] font-normal text-moss-deep">
                  gift
                </span>
              ) : null}
              {row.duration_months ? (
                <span className="ml-2 rounded-full bg-tangerine-mist px-2 py-0.5 text-[11px] font-normal text-tangerine-deeper">
                  {row.duration_months}mo prepaid
                </span>
              ) : null}
              {row.cause_tag ? (
                <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-mono font-normal text-ink-soft">
                  {row.cause_tag}
                </span>
              ) : null}
              {!row.is_active ? (
                <span className="ml-2 text-[11px] uppercase tracking-wide text-rose-700">
                  archived
                </span>
              ) : null}
            </p>
            <p className="text-[12.5px] text-ink-soft truncate">
              {row.description_en}
            </p>
          </div>
          <p className="text-[14px] font-mono text-ink shrink-0">
            ৳{row.amount_bdt.toLocaleString()}
          </p>
          <Edit3 className="h-4 w-4 text-slate-soft shrink-0" />
        </Link>
      </div>
    </li>
  );
}
