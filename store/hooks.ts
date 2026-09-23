"use client";

import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./index";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export function useCan(permission: string): boolean {
  return useAppSelector((state) => state.access.permissions[permission] ?? false);
}
