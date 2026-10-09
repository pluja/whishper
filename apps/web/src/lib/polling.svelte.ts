import { invalidateAll } from "$app/navigation";

export function pollWhileActive(isActive: () => boolean, intervalMs: number) {
  let tabVisible = $state(true);

  $effect(() => {
    const syncVisibility = () => {
      tabVisible = document.visibilityState === "visible";
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () =>
      document.removeEventListener("visibilitychange", syncVisibility);
  });

  $effect(() => {
    if (!isActive() || !tabVisible) return;
    const interval = window.setInterval(() => void invalidateAll(), intervalMs);
    return () => window.clearInterval(interval);
  });
}
