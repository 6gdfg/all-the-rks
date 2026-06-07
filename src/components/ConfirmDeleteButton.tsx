"use client";

import type React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";

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
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  if (compact) {
    return (
      <Button
        aria-label={label}
        shape="square"
        size="base"
        type="submit"
        formAction={formAction}
        variant="secondary-destructive"
        title={label}
        onClick={handleClick}
      >
        <Trash2 aria-hidden="true" size={16} />
      </Button>
    );
  }

  return (
    <Button
      size="base"
      type="submit"
      formAction={formAction}
      variant="secondary-destructive"
      title={label}
      onClick={handleClick}
    >
      <Trash2 aria-hidden="true" size={17} />
      {label}
    </Button>
  );
}
