"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getWhatsAppAccount, whatsappSession } from "@/actions/whatsapp";

const FAILURE_MESSAGE: Record<string, string> = {
  account_claimed: "This WhatsApp account is already linked to another CMS user.",
  user_has_other_account: "You already have a different WhatsApp account linked. Remove it before pairing another.",
  claim_unavailable: "The account could not be linked. Check the ownership service and try again.",
};

export default function WhatsAppAccountButton({ canPair }: Readonly<{ canPair: boolean }>) {
  const [paired, setPaired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState("Preparing your QR code…");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const refresh = useCallback(async () => {
    const result = await getWhatsAppAccount();
    if (!result?.data || result.data.error) throw new Error(result?.data?.error || result?.serverError || "Could not load WhatsApp account.");
    setPaired(Boolean(result.data.data));
    setLoaded(true);
    return Boolean(result.data.data);
  }, []);
  useEffect(() => {
    let cancelled = false;
    getWhatsAppAccount().then((result) => {
      if (cancelled) return;
      if (!result?.data || result.data.error) setError(result?.data?.error || result?.serverError || "Could not load WhatsApp account.");
      else setPaired(Boolean(result.data.data));
      setLoaded(true);
    }).catch(() => { if (!cancelled) { setError("Could not load WhatsApp account."); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  const processSession = useCallback(async (result: Awaited<ReturnType<typeof whatsappSession>>) => {
    if (!result?.data || result.data.error) throw new Error(result?.data?.error || result?.serverError || "Unable to connect to WhatsApp.");
    const session = result.data.data;
    if (!session) throw new Error("No session response received.");
    if (session.status === "connected") {
      if (!await refresh()) throw new Error("WhatsApp connected, but the CMS account claim is missing. Try pairing again.");
      setPolling(false);
      setOpen(false);
      setQr(null);
      toast.success("WhatsApp account added.");
      return false;
    }
    if (session.status === "failed") throw new Error(FAILURE_MESSAGE[session.reason ?? ""] || session.reason || "Pairing failed. Try again.");
    if (session.qr) setQr(session.qr);
    setMessage(session.qr ? "In WhatsApp, open Linked devices → Link a device and scan this code." : "Waiting for the WhatsApp connection…");
    return true;
  }, [refresh]);

  useEffect(() => {
    if (!open || !polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= expiresAt) {
        setPolling(false);
        setQr(null);
        setError("Pairing timed out. Try again for a fresh QR code.");
        return;
      }
      try {
        const result = await whatsappSession({ operation: "poll" });
        if (cancelled) return;
        if (await processSession(result)) timer = setTimeout(poll, 2000);
      } catch (failure) {
        if (cancelled) return;
        setPolling(false);
        setQr(null);
        setError(failure instanceof Error ? failure.message : "Could not check pairing.");
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, polling, expiresAt, processSession]);

  const start = async () => {
    setOpen(true); setBusy(true); setPolling(false); setError(""); setQr(null);
    setMessage("Preparing your QR code…");
    setExpiresAt(Date.now() + 120_000);
    try {
      const result = await whatsappSession({ operation: "start" });
      if (await processSession(result)) setPolling(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to start pairing.");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm("Remove your linked WhatsApp account?")) return;
    setBusy(true); setError("");
    try {
      const result = await whatsappSession({ operation: "remove" });
      if (!result?.data || result.data.error) throw new Error(result?.data?.error || result?.serverError || "Could not remove account.");
      setPaired(false);
      toast.success("WhatsApp account removed.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to remove account."); }
    finally { setBusy(false); }
  };
  if (!canPair && !paired) return null;
  return <>
    <div>
      <button type="button" disabled={!loaded || busy} onClick={paired ? remove : start}
        className="rounded-xl border border-teal bg-surface px-4 py-2 text-sm font-semibold text-teal-dark disabled:opacity-50">
        {paired ? "Remove WhatsApp account" : "Add WhatsApp account"}
      </button>
      {error && !open && <p role="alert" className="mt-1 max-w-sm text-xs text-red-700">{error}</p>}
    </div>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-pair-title" className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h2 id="whatsapp-pair-title" className="text-xl font-semibold text-ink">Add your WhatsApp account</h2>
        <p role="status" className="mt-3 text-sm text-muted">{message}</p>
        {qr && <div className="mt-4 flex justify-center">
          {/* QR images are generated in memory and must not pass through an image cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Scan this QR code with WhatsApp to link your account" width={320} height={320} />
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {!polling && !busy && <button type="button" onClick={start} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">Try again</button>}
          <button type="button" disabled={busy} onClick={() => { setOpen(false); setPolling(false); setQr(null); refresh().catch(() => {}); }}
            className="rounded-xl border border-line px-4 py-2 text-sm">Close</button>
        </div>
      </section>
    </div>}
  </>;
}
