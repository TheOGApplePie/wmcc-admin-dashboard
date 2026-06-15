"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { createPortal } from "react-dom";
import { Field, INPUT } from "@/app/components/ui/Field";
import { Btn } from "@/app/components/ui/Btn";
import { Icon } from "@/app/components/ui/Icon";
import { ROLES, ROLE_LABELS, ROLE_BLURBS } from "@/features/team/permissions";
import type { MemberRole } from "@/features/team/permissions";
import { inviteMember } from "@/features/team/actions";

interface InviteForm {
  email: string;
  role: MemberRole;
  area: string;
}

interface InviteModalProps {
  onClose: () => void;
}

export function InviteModal({ onClose }: Readonly<InviteModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    defaultValues: { email: "", role: "volunteer", area: "" },
  });

  const selectedRole = watch("role");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function onSubmit(data: InviteForm) {
    const res = await inviteMember({
      email: data.email,
      role: data.role,
      area: data.area || undefined,
    });

    if (res?.data?.error) {
      toast.error(res.data.error as string);
    } else if (res?.validationErrors) {
      toast.error("Please check the form for errors.");
    } else if (res?.serverError) {
      toast.error("Something went wrong. Please try again.");
    } else {
      toast.success(`Invite sent to ${data.email}.`);
      onClose();
    }
  }

  if (typeof document === "undefined") return null;
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  return createPortal(
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-[460px] w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-soft text-teal">
              <Icon d="M12 5v14M5 12h14" size={18} />
            </span>
            <h3 className="text-[16px] font-bold text-ink">Invite a team member</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors"
          >
            <Icon d="M18 6 6 18 M6 6l12 12" size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(100dvh - 200px)" }}>
            <Field label="Email address" error={errors.email?.message}>
              <input
                type="email"
                className={INPUT}
                placeholder="name@wmcc.ca"
                autoComplete="email"
                {...register("email", {
                  required: "Email is required.",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Enter a valid email address.",
                  },
                })}
              />
            </Field>

            {/* Role selector */}
            <div>
              <label className="mb-2 block text-[12px] font-semibold text-ink">Role</label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => {
                  const on = selectedRole === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setValue("role", r)}
                      className={`rounded-xl border-2 p-2.5 text-left transition-all ${
                        on
                          ? "border-teal bg-teal-soft/40"
                          : "border-line hover:border-stone-300"
                      }`}
                    >
                      <span className="block text-[12px] font-bold text-ink">
                        {ROLE_LABELS[r]}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                        {ROLE_BLURBS[r]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Area / focus (optional)">
              <input
                className={INPUT}
                placeholder="e.g. Events, Social Media"
                {...register("area", { maxLength: { value: 60, message: "Max 60 characters." } })}
              />
            </Field>

            {/* Info note */}
            <div className="flex items-start gap-2 rounded-xl bg-canvas/60 px-3 py-2.5 text-[11px] text-muted">
              <Icon
                d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z M18 8a4 4 0 0 1 0 8"
                size={14}
                className="mt-0.5 shrink-0 text-teal"
              />
              <span>
                They&apos;ll get an email invite to set a password. Permissions follow the{" "}
                <strong>{ROLE_LABELS[selectedRole]}</strong> preset — you can fine-tune them after
                they join.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
            >
              Cancel
            </button>
            <Btn type="submit" variant="primary" size="md" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Icon d="M22 2 11 13 M22 2l-7 20-4-9-9-4Z" size={14} />
              )}
              Send invite
            </Btn>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>,
    modalRoot,
  );
}
