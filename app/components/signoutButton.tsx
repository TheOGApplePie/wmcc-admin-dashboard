"use client";

import { useNavigationGuard } from "@/features/navigation/UnsavedChangesProvider";
import { signUserOut } from "@/actions/authentication";

export default function SignoutButton() {
  const guard = useNavigationGuard();
  return (
    <button
      className="hover:cursor-pointer"
      type="button"
      onClick={() => {
        if (guard)
          guard.request(() => {
            void signUserOut();
          });
        else void signUserOut();
      }}
    >
      Signout
    </button>
  );
}
