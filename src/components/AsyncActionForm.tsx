"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";

type InlineActionState = {
  status: "idle" | "success" | "error";
  message: string;
  nonce: number;
};

type AsyncActionFormProps = {
  action: (
    state: InlineActionState,
    formData: FormData
  ) => Promise<InlineActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  style?: CSSProperties;
};

const initialState: InlineActionState = {
  status: "idle",
  message: "",
  nonce: 0
};

export function AsyncActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  style
}: AsyncActionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    setIsVisible(true);

    if (state.status === "success") {
      router.refresh();

      if (resetOnSuccess) {
        formRef.current?.reset();
      }
    }

    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [resetOnSuccess, router, state.nonce, state.status]);

  return (
    <form action={formAction} className={className} ref={formRef} style={style}>
      {children}
      <p
        className={
          state.status === "error"
            ? "inline-action-status inline-action-status-error"
            : "inline-action-status"
        }
        aria-live="polite"
        hidden={!isPending && !isVisible}
      >
        {isPending ? "操作中..." : state.message}
      </p>
    </form>
  );
}
