"use client";

import { PASSWORD_REQUIREMENTS, passwordRequirementChecks } from "@evcharge/shared";
import { Check, Circle } from "lucide-react";

export function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordRequirementChecks(password);

  return (
    <ul className="space-y-1.5 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
      {PASSWORD_REQUIREMENTS.map((item) => {
        const ok = checks[item.id];
        return (
          <li
            key={item.id}
            className={`flex items-center gap-2 ${ok ? "text-primary" : "text-muted-foreground"}`}
          >
            {ok ? <Check className="size-3.5 shrink-0" /> : <Circle className="size-3.5 shrink-0" />}
            <span>{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
