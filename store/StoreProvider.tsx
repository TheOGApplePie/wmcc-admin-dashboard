"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import type { ViewerAccess } from "@/features/access/types";
import { makeStore } from "./index";

export function StoreProvider({ access, children }: Readonly<{
  access: ViewerAccess;
  children: React.ReactNode;
}>) {
  const [store] = useState(() => makeStore(access));
  return <Provider store={store}>{children}</Provider>;
}
