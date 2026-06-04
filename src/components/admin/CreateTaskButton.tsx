"use client";

// Spine 1.1 — Trigger for the CreateTaskModal.
// The server page renders this; the modal mounts only when open.

import { useState } from "react";
import { ListChecks } from "lucide-react";
import {
  CreateTaskModal,
  type CreateTaskModalProps,
} from "./CreateTaskModal";

type ButtonProps = Omit<CreateTaskModalProps, "open" | "onClose"> & {
  label?: string;
};

export function CreateTaskButton(props: ButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-tangerine-mist text-tangerine-deeper px-4 py-2 text-[13px] font-medium hover:bg-tangerine-soft transition-colors"
      >
        <ListChecks className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {props.label ?? "Create field task"}
      </button>
      <CreateTaskModal
        open={open}
        onClose={() => setOpen(false)}
        sponsorshipId={props.sponsorshipId}
        childId={props.childId}
        childDisplayName={props.childDisplayName}
        childDivisionCode={props.childDivisionCode}
        childDivisionName={props.childDivisionName}
        availableDIs={props.availableDIs}
        pickableChildren={props.pickableChildren}
      />
    </>
  );
}
