"use client";

import { useCan } from "@/store/hooks";

export function Can({ permission, children, fallback = null }: Readonly<{
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}>) {
  return useCan(permission) ? children : fallback;
}
