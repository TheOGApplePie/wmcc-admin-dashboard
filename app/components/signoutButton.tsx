"use client";

import { signUserOut } from "@/actions/authentication";

export default function SignoutButton() {
  return (
    <button
      className="hover:cursor-pointer"
      type="button"
      onClick={() => {
        signUserOut();
      }}
    >
      Signout
    </button>
  );
}
