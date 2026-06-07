"use client";

import { Trash2 } from "lucide-react";

type ConfirmDeleteButtonProps = {
  label: string;
  message: string;
  compact?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
};

export function ConfirmDeleteButton({
  label,
  message,
  compact = false,
  formAction
}: ConfirmDeleteButtonProps) {
  return (
    <button
      className={compact ? "icon-button" : "danger-button"}
      type="submit"
      formAction={formAction}
      title={label}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 aria-hidden="true" size={compact ? 16 : 17} />
      {compact ? null : label}
    </button>
  );
}
