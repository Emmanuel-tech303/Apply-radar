"use client";

import type { ReactNode } from "react";

export const OPEN_QUICK_ADD_EVENT = "applyradar:open-quick-add";

export function QuickAddTrigger({ className, children, ariaLabel, onClick }: { className: string; children: ReactNode; ariaLabel?: string; onClick?: () => void }) {
  return <button className={className} type="button" aria-label={ariaLabel} onClick={() => { onClick?.(); window.dispatchEvent(new Event(OPEN_QUICK_ADD_EVENT)); }}>{children}</button>;
}
