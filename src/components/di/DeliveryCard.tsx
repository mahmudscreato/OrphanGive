// Session 45 — single delivery card.
//
// Server component. The photo is the trust signal — it sits
// prominently above the description.

import Image from "next/image";
import { StatusPill } from "./StatusPill";
import type { AidType, DeliverySummary } from "@/lib/di-deliveries";

const AID_LABEL: Record<AidType, string> = {
  education: "Education",
  food: "Food",
  healthcare: "Healthcare",
  clothing: "Clothing",
  general_care: "General care",
  other: "Other",
};

const AID_BG: Record<AidType, string> = {
  education: "bg-tangerine-mist text-tangerine-deeper",
  food: "bg-moss-soft text-moss-deep",
  healthcare: "bg-stone-100 text-ink-soft",
  clothing: "bg-tangerine-mist text-tangerine-deeper",
  general_care: "bg-stone-100 text-ink-soft",
  other: "bg-stone-100 text-ink-soft",
};

function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function DeliveryCard({ delivery }: { delivery: DeliverySummary }) {
  const dateLine = formatLongDate(delivery.deliveryDate);
  const statusKind = delivery.status; // pending | verified | rejected

  return (
    <article className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden mb-3">
      {/* Photo evidence — top of the card, edge-to-edge */}
      {delivery.photoUrl ? (
        <div className="relative w-full aspect-[4/3] bg-tangerine-mist">
          <Image
            src={delivery.photoUrl}
            alt={delivery.description || AID_LABEL[delivery.aidType]}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      ) : null}

      <div className="p-5 space-y-3">
        {/* Aid type + date + status */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${AID_BG[delivery.aidType]}`}
          >
            {AID_LABEL[delivery.aidType]}
          </span>
          {dateLine ? (
            <span className="text-[12.5px] text-ink-soft">{dateLine}</span>
          ) : null}
          <span className="ml-auto">
            <StatusPill kind={statusKind} />
          </span>
        </div>

        {/* Description */}
        {delivery.description ? (
          <p className="text-[15px] text-ink leading-relaxed">
            {delivery.description}
          </p>
        ) : null}

        {/* Sponsor link line */}
        {delivery.sponsorDisplayName ? (
          <p className="text-[12.5px] text-ink-soft">
            Funded by{" "}
            <span className="text-ink font-medium">
              {delivery.sponsorDisplayName}
            </span>
          </p>
        ) : null}

        {/* Acknowledgment in Caveat italic — warmer signal of trust */}
        {delivery.recipientAcknowledgment ? (
          <p className="font-script italic text-[16px] text-slate leading-relaxed border-l-2 border-tangerine-soft pl-3">
            “{delivery.recipientAcknowledgment}”
          </p>
        ) : null}

        {/* Rejection note */}
        {delivery.status === "rejected" && delivery.rejectionReason ? (
          <p className="text-[13px] text-ink-soft leading-relaxed">
            <span className="text-ink font-medium">Reason:</span>{" "}
            {delivery.rejectionReason}
          </p>
        ) : null}

        {/* Deliverer line */}
        <div className="text-[12.5px] text-ink-soft">
          Delivered by {delivery.deliveredByName}
        </div>
      </div>
    </article>
  );
}
