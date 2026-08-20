import { useCallback, useEffect } from "react";

const DEFAULT_MESSAGE = "Unsaved changes will be lost. Continue?";

interface InterceptableNavigateEvent extends Event {
  canIntercept: boolean;
  downloadRequest: string | null;
  hashChange: boolean;
}

type NavigationTarget = EventTarget;

export function useUnsavedChanges(
  hasUnsavedChanges: boolean,
  message = DEFAULT_MESSAGE,
) {
  const confirmDiscardChanges = useCallback(
    () => !hasUnsavedChanges || globalThis.confirm(message),
    [hasUnsavedChanges, message],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const navigation = (
      window as unknown as { navigation?: NavigationTarget }
    ).navigation;

    if (navigation) {
      const handleNavigate = (rawEvent: Event) => {
        const event = rawEvent as InterceptableNavigateEvent;
        if (
          !event.cancelable ||
          !event.canIntercept ||
          event.downloadRequest ||
          event.hashChange
        )
          return;

        if (!globalThis.confirm(message)) event.preventDefault();
      };

      navigation.addEventListener("navigate", handleNavigate);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        navigation.removeEventListener("navigate", handleNavigate);
      };
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;

      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;

      if (!globalThis.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges, message]);

  return confirmDiscardChanges;
}
