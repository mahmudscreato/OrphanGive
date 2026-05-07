"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Minimal top-right toast system used by the dashboard pages. No
// dependency, no portal — toasts render inside the provider's wrapper
// using fixed positioning. Auto-dismisses after 4 seconds.

type ToastTone = "success" | "error";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  push: (tone: ToastTone, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, tone, message }]);
      const timer = setTimeout(() => remove(id), 4000);
      timeoutsRef.current.set(id, timer);
    },
    [remove],
  );

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    const timers = timeoutsRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value: ToastContextValue = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none max-md:right-4 max-md:left-4 max-md:top-4"
      >
        {toasts.map((t) => (
          <ToastBubble key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBubble({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const isSuccess = toast.tone === "success";
  return (
    <div
      role="status"
      onClick={onClose}
      className={
        "pointer-events-auto rounded-[14px] px-4 py-3 shadow-card cursor-pointer text-[13.5px] leading-[1.5] max-w-[360px] border " +
        (isSuccess
          ? "bg-moss-soft text-moss border-moss/30"
          : "bg-[#FEEFEF] text-[#A02B2B] border-[#F4C7C7]")
      }
    >
      {toast.message}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback for code paths that haven't been wrapped in
    // <ToastProvider /> — log once instead of throwing.
    if (typeof window !== "undefined") {
      console.warn(
        "[Toast] useToast() called outside <ToastProvider />; toasts won't render.",
      );
    }
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
    };
  }
  return ctx;
}
