// Task system piece #2 — quick-create templates.
//
// Single source of truth mapping each structured task TYPE to default
// pre-fill copy for the create form. The STORED value is always the
// structured `task.type` (see migrations/task-types-1); templates only
// supply starting title/description/priority the admin can edit.
//
// Used by the admin create surface (CreateTaskModal's template picker)
// and by the task list's type badge (TASK_TYPE_LABELS).
//
// No "server-only" guard: this is pure data + safe to import into the
// "use client" CreateTaskModal. It contains no secrets and no
// server-only deps.

import type { TaskPriority, TaskType } from "./di-tasks";

export interface TaskTemplate {
  type: TaskType;
  /** Picker button label. */
  label: string;
  /** One-line helper under the label in the picker. */
  hint: string;
  /** Pre-filled title. Empty string = no pre-fill (blank/custom). */
  title: string;
  /** Pre-filled description. Empty string = no pre-fill. */
  description: string;
  /** Pre-filled priority. */
  priority: TaskPriority;
}

// Order = display order in the picker. The four named templates carry
// pre-fill copy; "General" and "Custom" set only the type (no copy) so
// the admin starts from a blank form — "General" for an ordinary task,
// "Custom" for an explicit one-off.
export const TASK_TEMPLATES: ReadonlyArray<TaskTemplate> = [
  {
    type: "need_report",
    label: "Need report",
    hint: "Ask the DI to write a progress report for the donor.",
    title: "Submit a progress report",
    description:
      "Write up how the child is doing — schooling, health, home situation — for the donor update.",
    priority: "normal",
  },
  {
    type: "delivery_photos",
    label: "Delivery photos",
    hint: "Ask for photo evidence of an aid delivery.",
    title: "Upload delivery photos",
    description:
      "Photograph the aid delivery (items, and the child where consent allows) and upload as evidence.",
    priority: "normal",
  },
  {
    type: "need_moments",
    label: "Need moments",
    hint: "Ask for candid moments for the donor's feed.",
    title: "Capture moments",
    description:
      "Take a few candid photos or short notes of the child for the donor's moments feed.",
    priority: "normal",
  },
  {
    type: "health_check",
    label: "Health check",
    hint: "Ask the DI to record a health check.",
    title: "Complete a health check",
    description:
      "Record the child's current health status and flag anything that needs follow-up.",
    priority: "high",
  },
  {
    type: "general",
    label: "General task",
    hint: "A plain task — start from a blank form.",
    title: "",
    description: "",
    priority: "normal",
  },
  {
    type: "custom",
    label: "Custom",
    hint: "A one-off task — fill everything in yourself.",
    title: "",
    description: "",
    priority: "normal",
  },
];

export function getTaskTemplate(type: TaskType): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.type === type);
}

// Short labels for the task-list type badge. Kept separate from the
// template `label` so the badge can stay terse even if a picker label
// grows.
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  need_report: "Report",
  delivery_photos: "Delivery photos",
  need_moments: "Moments",
  health_check: "Health check",
  general: "General",
  custom: "Custom",
};
