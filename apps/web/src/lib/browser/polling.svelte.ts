import { invalidateAll } from "$app/navigation";

export function pollWhileActive(isActive: () => boolean, intervalMs: number) {
  let tabVisible = $state(true);
  let refreshing = false;

  // A slow load must not stack another refresh behind it.
  function refresh(): void {
    if (refreshing) return;
    refreshing = true;
    void invalidateAll().finally(() => {
      refreshing = false;
    });
  }

  $effect(() => {
    tabVisible = document.visibilityState === "visible";
    const syncVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (visible && !tabVisible && isActive()) refresh();
      tabVisible = visible;
    };
    document.addEventListener("visibilitychange", syncVisibility);
    return () =>
      document.removeEventListener("visibilitychange", syncVisibility);
  });

  $effect(() => {
    if (!isActive() || !tabVisible) return;
    const interval = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(interval);
  });
}
