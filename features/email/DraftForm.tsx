"use client";

import { useState } from "react";
import { useUnsavedChanges } from "@/features/events/hooks/useUnsavedChanges";
import { saveCommunication } from "./actions";

export function DraftForm({ children }: Readonly<{ children: React.ReactNode }>) {
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  return <form action={saveCommunication} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)} className="space-y-4 rounded-xl border border-line bg-surface p-5">{children}</form>;
}
