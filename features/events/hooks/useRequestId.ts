"use client";

import { useRef } from "react";

export function useRequestId() {
  const current = useRef({ payload: "", id: "" });
  return (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    if (serialized !== current.current.payload)
      current.current = { payload: serialized, id: crypto.randomUUID() };
    return current.current.id;
  };
}
