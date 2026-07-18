// Session 52b — Per-child intake-photo batch review client component.
//
// Each pending photo gets approve / reject toggle buttons. Rejected
// photos require an inline reason (min 10 chars) before "Submit
// decisions" can fire. Submit POSTs all decisions to the batch
// endpoint in one request; per-photo result feedback shows which
// (if any) failed.
//
// Already-decided photos (approved / rejected / archived) render
// read-only with their existing state pill.

"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, Trash2, XCircle } from "lucide-react";
import type { AdminIntakePhotoSummary } from "@/lib/admin-intake-photos";
import { intakePhotoStatusLabel } from "@/lib/status-labels";
import { AdminRemoveButton } from "./AdminRemoveButton";

// Session 52d — admin direct upload limits mirror the DI ones
// (PHOTO_LIMITS). We don't import them at module load to keep the
// admin bundle independent of the DI lib; the values are inlined
// here as constants. Server re-checks via uploadPhotoToDirectus.
const ADMIN_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ADMIN_PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Decision =
  | { kind: "none" }
  | { kind: "approve" }
  | { kind: "reject"; reason: string };

interface PerPhotoState {
  decision: Decision;
}

export function IntakePhotoBatchReview({
  childId,
  childDisplayName,
  photos,
}: {
  // Session 52d — childId is now consumed for the admin direct-
  // upload form (POSTs multipart with childId). Still resolvable
  // from `photos[0].childId` but accepting it explicitly avoids
  // an empty-photos edge case (admin opening a child whose photos
  // were all removed — but admin still wants to upload fresh ones).
  childId: string;
  childDisplayName: string;
  photos: AdminIntakePhotoSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Only pending photos are mutable in this UI.
  const pendingPhotos = useMemo(
    () => photos.filter((p) => p.status === "pending"),
    [photos],
  );
  const decidedPhotos = useMemo(
    () => photos.filter((p) => p.status !== "pending"),
    [photos],
  );

  const [state, setState] = useState<Record<string, PerPhotoState>>(() => {
    const out: Record<string, PerPhotoState> = {};
    for (const p of pendingPhotos) out[p.id] = { decision: { kind: "none" } };
    return out;
  });

  function setDecision(photoId: string, decision: Decision) {
    setState((prev) => ({ ...prev, [photoId]: { decision } }));
  }

  // Session 52c — per-photo remove (admin cleanup for accidental
  // DI uploads, distinct from rejection). After a successful
  // DELETE we router.refresh() so the server component re-fetches
  // the photo set; client state for OTHER photos' in-progress
  // decisions persists (the removed photo's state entry becomes an
  // orphan key but is silently dropped by readyDecisions which
  // iterates pendingPhotos derived from props).
  async function handleRemove(photoId: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/intake-photos/${photoId}`, {
          method: "DELETE",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
        };
        if (!res.ok || !body.ok) {
          if (body.error === "invalid_status") {
            setServerError(
              "Someone else already decided that photo. Refresh to see the current state.",
            );
          } else if (body.error === "not_found") {
            setServerError("That photo no longer exists.");
          } else {
            setServerError(body.message ?? "Couldn't remove. Try again.");
          }
          return;
        }
        // Soft refresh — preserves OTHER photos' in-progress
        // toggle state, drops the removed one from the rendered set.
        router.refresh();
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  // Decisions ready to submit: every "decision !== none" + every
  // reject has a 10+ char reason.
  const readyDecisions = useMemo(() => {
    const out: Array<
      | { photoId: string; decision: "approve" }
      | { photoId: string; decision: "reject"; reason: string }
    > = [];
    for (const p of pendingPhotos) {
      const d = state[p.id]?.decision;
      if (!d || d.kind === "none") continue;
      if (d.kind === "approve") {
        out.push({ photoId: p.id, decision: "approve" });
      } else if (d.kind === "reject" && d.reason.trim().length >= 10) {
        out.push({
          photoId: p.id,
          decision: "reject",
          reason: d.reason.trim(),
        });
      }
    }
    return out;
  }, [pendingPhotos, state]);

  const anyDecisionStarted = pendingPhotos.some(
    (p) => state[p.id]?.decision.kind !== "none",
  );
  const incompleteRejects = pendingPhotos.some((p) => {
    const d = state[p.id]?.decision;
    return d?.kind === "reject" && d.reason.trim().length < 10;
  });
  const canSubmit =
    !pending &&
    readyDecisions.length > 0 &&
    !incompleteRejects;

  // ─── Session 52d — admin direct upload ─────────────────────────────
  // Admin can drop in photos that bypass the review queue (status =
  // 'approved' immediately, uploaded_by = admin). Used when admin
  // staff have visited the child themselves or received photos out-
  // of-band. Multi-file: each file uploads in parallel via the
  // POST /api/admin/intake-photos endpoint.
  type AdminInflight = { localId: string; fileName: string; error: string | null };
  const [adminInflight, setAdminInflight] = useState<AdminInflight[]>([]);
  const [adminUploadError, setAdminUploadError] = useState<string | null>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  function pickAdminFiles() {
    adminFileInputRef.current?.click();
  }

  async function uploadOneAdminPhoto(
    file: File,
    localId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!ADMIN_PHOTO_ALLOWED_TYPES.includes(file.type)) {
      return {
        ok: false,
        error: "Unsupported type — JPEG, PNG, or WebP only.",
      };
    }
    if (file.size > ADMIN_PHOTO_MAX_BYTES) {
      return {
        ok: false,
        error: `Too large — ${formatBytes(file.size)} (max ${formatBytes(ADMIN_PHOTO_MAX_BYTES)}).`,
      };
    }
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("childId", childId);
      const res = await fetch("/api/admin/intake-photos", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        if (res.status === 413) return { ok: false, error: "Too large (max 5 MB)." };
        if (res.status === 415) return { ok: false, error: "Unsupported file type." };
        if (res.status === 401) return { ok: false, error: "Session expired." };
        return { ok: false, error: "Upload failed." };
      }
      // Drop the inflight entry on success; server-component refresh
      // picks up the new row.
      setAdminInflight((prev) => prev.filter((u) => u.localId !== localId));
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error during upload." };
    }
  }

  async function handleAdminUploadMany(files: File[]) {
    if (files.length === 0) return;
    setAdminUploadError(null);

    const stamped = files.map((file, i) => ({
      file,
      localId: `admin-up-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    setAdminInflight((prev) => [
      ...prev,
      ...stamped.map(({ localId, file }) => ({
        localId,
        fileName: file.name || "photo",
        error: null,
      })),
    ]);

    const results = await Promise.all(
      stamped.map(({ file, localId }) =>
        uploadOneAdminPhoto(file, localId).then((r) => ({ localId, ...r })),
      ),
    );
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      setAdminInflight((prev) =>
        prev.map((u) => {
          const fail = failures.find((f) => f.localId === u.localId);
          if (!fail) return u;
          return { ...u, error: fail.ok ? null : fail.error };
        }),
      );
    }
    // If at least one succeeded, refresh so the server-fetched photo
    // list reflects the new approved rows.
    if (results.some((r) => r.ok)) {
      router.refresh();
    }
  }

  function dismissAdminInflight(localId: string) {
    setAdminInflight((prev) => prev.filter((u) => u.localId !== localId));
  }

  async function onSubmit() {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/intake-photos/batch-decide", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decisions: readyDecisions }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          succeeded?: number;
          failed?: number;
          error?: string;
          message?: string;
        };
        if (!res.ok || !body.ok) {
          setServerError(
            body.message ?? "Couldn't submit decisions. Try again.",
          );
          return;
        }
        const failed = body.failed ?? 0;
        if (failed > 0) {
          setServerError(
            `Submitted ${body.succeeded ?? 0} of ${readyDecisions.length}. ${failed} failed — refresh to see which.`,
          );
          // Still refresh so the failed photos show their new state.
          window.setTimeout(() => router.refresh(), 800);
          return;
        }
        setSuccessToast(
          `Submitted ${body.succeeded} decision${body.succeeded === 1 ? "" : "s"} for ${childDisplayName}.`,
        );
        window.setTimeout(() => {
          router.push("/admin/reviews/intake-photos");
          router.refresh();
        }, 800);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  return (
    <>
      {serverError ? (
        <div
          className="mb-4 rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}
      {successToast ? (
        <div
          className="mb-4 rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      {/* Session 52d — admin direct upload strip. Sits above the
          pending grid so the affordance is obvious; clicking opens
          the OS file picker (multi-select). Uploads land as
          approved immediately. */}
      <section
        aria-label="Admin direct upload"
        className="mb-6 rounded-2xl bg-stone-50 border border-stone-200 p-4 md:p-5"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] text-ink leading-tight">
              Add photos directly
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
              Lands as approved immediately (skips the review queue).
              Use for photos admin took on a site visit or received
              out-of-band.
            </p>
          </div>
          <button
            type="button"
            onClick={pickAdminFiles}
            disabled={pending || adminInflight.some((u) => !u.error)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[13px] font-medium hover:bg-tangerine-mist/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adminInflight.some((u) => !u.error) ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            )}
            {adminInflight.some((u) => !u.error)
              ? `Uploading ${adminInflight.filter((u) => !u.error).length}…`
              : "Add photos"}
          </button>
        </div>
        <input
          ref={adminFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          aria-hidden="true"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length > 0) void handleAdminUploadMany(files);
          }}
        />
        {adminUploadError ? (
          <p className="mt-2 text-[12.5px] text-amber-800">{adminUploadError}</p>
        ) : null}
        {adminInflight.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {adminInflight.map((up) => (
              <li
                key={up.localId}
                className={`flex items-center justify-between gap-3 text-[12px] rounded-lg px-3 py-1.5 ${
                  up.error
                    ? "bg-[#FCE9E9] text-[#A02020]"
                    : "bg-tangerine-mist/40 text-tangerine-deeper"
                }`}
              >
                <span className="truncate font-medium">{up.fileName}</span>
                {up.error ? (
                  <>
                    <span className="shrink-0">{up.error}</span>
                    <button
                      type="button"
                      onClick={() => dismissAdminInflight(up.localId)}
                      className="shrink-0 text-[11px] font-medium hover:underline"
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Pending grid */}
      {pendingPhotos.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center mb-6">
          <p className="text-[14px] text-ink-soft leading-relaxed">
            No photos are currently pending for {childDisplayName}.
          </p>
        </div>
      ) : (
        <section
          aria-label="Pending intake photos"
          className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
        >
          <h2 className="font-display text-[18px] text-ink mb-4">
            Pending review ({pendingPhotos.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingPhotos.map((p) => (
              <PhotoReviewCard
                key={p.id}
                photo={p}
                decision={state[p.id]?.decision ?? { kind: "none" }}
                onDecision={(d) => setDecision(p.id, d)}
                onRemove={() => handleRemove(p.id)}
                disabled={pending}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-[12.5px] text-ink-soft">
              {anyDecisionStarted
                ? `${readyDecisions.length} of ${pendingPhotos.length} ready to submit.`
                : "Pick approve or reject on at least one photo to submit."}
              {incompleteRejects ? (
                <span className="block text-amber-700">
                  Some rejection notes need at least 10 characters.
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : null}
              Submit {readyDecisions.length > 0 ? readyDecisions.length : ""}{" "}
              decision{readyDecisions.length === 1 ? "" : "s"}
            </button>
          </div>
        </section>
      )}

      {/* Already-decided photos (read-only) */}
      {decidedPhotos.length > 0 ? (
        <section
          aria-label="Previously decided photos"
          className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
        >
          <h2 className="font-display text-[18px] text-ink mb-4">
            Previously decided ({decidedPhotos.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {decidedPhotos.map((p) => (
              <DecidedPhotoCard key={p.id} photo={p} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function PhotoReviewCard({
  photo,
  decision,
  onDecision,
  onRemove,
  disabled,
}: {
  photo: AdminIntakePhotoSummary;
  decision: Decision;
  onDecision: (d: Decision) => void;
  // Session 52c — admin cleanup remove (distinct from reject). The
  // two-tap confirm lives inline on the card to avoid an extra
  // modal during batch flow.
  onRemove: () => void;
  disabled: boolean;
}) {
  const isApproved = decision.kind === "approve";
  const isRejected = decision.kind === "reject";
  const [removeArmed, setRemoveArmed] = useState(false);
  // Disarm after a short window so a stray earlier click doesn't
  // sit ready forever.
  useEffect(() => {
    if (!removeArmed) return;
    const t = window.setTimeout(() => setRemoveArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [removeArmed]);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/40 overflow-hidden">
      <div className="relative aspect-[4/3] bg-stone-100">
        {photo.photoUrl ? (
          <Image
            src={photo.photoUrl}
            alt={photo.caption ?? "Intake photo"}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            unoptimized
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="p-3 space-y-2">
        {photo.caption ? (
          <p className="text-[12.5px] text-ink-soft leading-snug">
            {photo.caption}
          </p>
        ) : (
          <p className="text-[12.5px] italic text-ink-soft leading-snug">
            No caption
          </p>
        )}
        <p className="text-[11px] text-ink-soft">
          Uploaded by {photo.uploadedByName}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              isApproved
                ? onDecision({ kind: "none" })
                : onDecision({ kind: "approve" })
            }
            disabled={disabled}
            className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
              isApproved
                ? "bg-moss text-white border-moss"
                : "bg-white text-ink-soft border-stone-300 hover:border-moss hover:text-moss-deep"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            onClick={() =>
              isRejected
                ? onDecision({ kind: "none" })
                : onDecision({ kind: "reject", reason: "" })
            }
            disabled={disabled}
            className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
              isRejected
                ? "bg-[#A02B2B] text-white border-[#A02B2B]"
                : "bg-white text-ink-soft border-stone-300 hover:border-[#A02B2B] hover:text-[#A02B2B]"
            }`}
          >
            <XCircle className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
            Reject
          </button>
        </div>
        {isRejected ? (
          <div className="pt-1">
            <textarea
              rows={2}
              value={decision.reason}
              onChange={(e) =>
                onDecision({ kind: "reject", reason: e.target.value })
              }
              maxLength={1000}
              placeholder="Why? (min 10 characters — the DI sees this)"
              disabled={disabled}
              className="w-full rounded-lg border border-ink/[0.12] bg-white px-3 py-2 text-[12.5px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-1 focus:ring-tangerine-soft transition-colors"
            />
            <p className="mt-1 text-[10.5px] text-ink-soft">
              {decision.reason.trim().length}/1000
              {decision.reason.trim().length < 10 ? (
                <span className="text-amber-700 ml-2">
                  {10 - decision.reason.trim().length} more
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
        {/* Session 52c — Remove (cleanup, distinct from Reject).
            Two-tap confirm sits inline; copy makes the semantic
            difference explicit. */}
        <div className="pt-1.5 border-t border-stone-200/60 mt-1">
          <button
            type="button"
            onClick={() => {
              if (removeArmed) {
                onRemove();
                setRemoveArmed(false);
              } else {
                setRemoveArmed(true);
              }
            }}
            disabled={disabled}
            className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
              removeArmed
                ? "text-[#A02B2B]"
                : "text-stone-500 hover:text-[#A02B2B]"
            } disabled:opacity-60`}
          >
            <Trash2 className="w-3 h-3 stroke-[1.75]" aria-hidden="true" />
            {removeArmed
              ? "Tap again to remove (no DI notification)"
              : "Remove (DI uploaded by mistake)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecidedPhotoCard({ photo }: { photo: AdminIntakePhotoSummary }) {
  const statusStyle: Record<
    Exclude<AdminIntakePhotoSummary["status"], "pending">,
    { ring: string; pill: string; pillText: string }
  > = {
    approved: {
      ring: "border-moss",
      pill: "bg-moss-soft",
      pillText: "text-moss-deep",
    },
    rejected: {
      ring: "border-[#A02B2B]/40",
      pill: "bg-[#FCE9E9]",
      pillText: "text-[#A02020]",
    },
    archived: {
      ring: "border-stone-300",
      pill: "bg-stone-100",
      pillText: "text-stone-700",
    },
  };
  const s = photo.status === "pending" ? statusStyle.approved : statusStyle[photo.status];
  return (
    <div className={`rounded-xl border ${s.ring} bg-white overflow-hidden`}>
      <div className="relative aspect-square bg-stone-100">
        {photo.photoUrl ? (
          <Image
            src={photo.photoUrl}
            alt={photo.caption ?? "Intake photo"}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
            className="object-cover"
          />
        ) : null}
        <div
          className={`absolute top-1.5 right-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider font-semibold ${s.pill} ${s.pillText}`}
        >
          {intakePhotoStatusLabel(photo.status)}
        </div>
      </div>
      {photo.status === "rejected" && photo.rejectionReason ? (
        <p className="px-2 py-1.5 text-[11px] text-[#A02020] leading-snug line-clamp-2">
          {photo.rejectionReason}
        </p>
      ) : null}
      {/* Session 52d — admin can remove an already-approved photo
          for ongoing curation. Uses the AdminRemoveButton's
          approved mode (modal + reason). Only on approved (the
          common reversal); archived = terminal. */}
      {photo.status === "approved" ? (
        <div className="px-2 pt-1.5 pb-2 border-t border-stone-200">
          <AdminRemoveButton
            endpoint={`/api/admin/intake-photos/${photo.id}`}
            redirectTo="/admin/reviews/intake-photos"
            entityNoun="intake photo"
            wasApproved
          />
        </div>
      ) : null}
      {/* fix/admin-quick-batch — admin can delete a REJECTED intake
          photo to free its slot (mirrors the DI's own removal power,
          which allows pending OR rejected — see
          di-intake-photos.ts:deleteIntakePhoto). Two-tap confirm, no
          DI notification (the DI already saw the rejection). The
          route + removeIntakePhoto already accept any status; this
          just surfaces the control that was previously missing on
          decided rows. Approved uses the modal path above; archived
          stays terminal. */}
      {photo.status === "rejected" ? (
        <div className="px-2 pt-1.5 pb-2 border-t border-stone-200">
          <AdminRemoveButton
            endpoint={`/api/admin/intake-photos/${photo.id}`}
            redirectTo="/admin/reviews/intake-photos"
            entityNoun="intake photo"
            helperText="Deletes this rejected photo and frees its slot for a re-upload. The DI already saw the rejection, so they aren't notified again."
          />
        </div>
      ) : null}
    </div>
  );
}
