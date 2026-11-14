"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "react-hot-toast";

// Native modal dialogs occupy the browser's top layer, above every body z-index.
// Place the single toaster inside the most recently opened dialog while it is open.
export default function AppToaster() {
  const [host, setHost] = useState<HTMLDialogElement | null>(null);

  useEffect(() => {
    let dialogs: HTMLDialogElement[] = [];
    const sync = (records: MutationRecord[]) => {
      dialogs = dialogs.filter((dialog) => dialog.isConnected && dialog.open);
      for (const record of records) {
        if (
          record.type === "attributes" &&
          record.target instanceof HTMLDialogElement
        ) {
          const dialog = record.target;
          dialogs = dialogs.filter((item) => item !== dialog);
          if (dialog.isConnected && dialog.open) dialogs.push(dialog);
        }
      }
      for (const dialog of document.querySelectorAll<HTMLDialogElement>(
        "dialog[open]",
      )) {
        if (!dialogs.includes(dialog)) dialogs.push(dialog);
      }
      setHost(dialogs.at(-1) ?? null);
    };
    const observer = new MutationObserver((records) => {
      const changed = records.some(
        (record) =>
          record.type === "attributes" ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches("dialog") || node.querySelector("dialog")),
          ),
      );
      if (changed) sync(records);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true,
    });
    // Observe first so dialogs opened by other mount effects are also included.
    queueMicrotask(() => {
      if (active) sync([]);
    });
    let active = true;
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  const toaster = <Toaster containerStyle={{ zIndex: 2147483647 }} />;
  return host ? createPortal(toaster, host) : toaster;
}
