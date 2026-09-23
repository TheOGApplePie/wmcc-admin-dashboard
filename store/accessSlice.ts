import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ViewerAccess } from "@/features/access/types";

const initialState: ViewerAccess = { profile: null, permissions: {} };

const accessSlice = createSlice({
  name: "access",
  initialState,
  reducers: {
    accessReplaced: (_state, action: PayloadAction<ViewerAccess>) => action.payload,
    accessCleared: () => initialState,
  },
});

export const { accessReplaced, accessCleared } = accessSlice.actions;
export default accessSlice.reducer;
