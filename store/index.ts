import { configureStore } from "@reduxjs/toolkit";
import accessReducer from "./accessSlice";
import type { ViewerAccess } from "@/features/access/types";

export function makeStore(access: ViewerAccess) {
  return configureStore({
    reducer: { access: accessReducer },
    preloadedState: { access },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
