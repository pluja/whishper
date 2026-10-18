<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconName } from "./icon-names";

  let {
    name,
    size = 18,
    label,
  }: { name: IconName; size?: number; label?: string } = $props();

  const ICONS: Record<IconName, Snippet> = {
    projects,
    file,
    check,
    edit,
    close,
    search,
    activity,
    cpu,
    lock,
    "arrow-left": arrowLeft,
    plus,
    logout,
    subtitles,
    "chevron-down": chevronDown,
    play,
    audio,
    undo,
    redo,
    scissors,
    merge,
    trash,
    download,
    more,
    sun,
    moon,
    monitor,
    pause,
    "chevron-left": chevronLeft,
    "chevron-right": chevronRight,
    "skip-back": skipBack,
    "skip-forward": skipForward,
    keyboard,
    alert,
    refresh,
    "zoom-in": zoomIn,
    "zoom-out": zoomOut,
    "fit-width": fitWidth,
  };
</script>

{#snippet projects()}
  <path d="M4 5.5h16v13H4z" />
  <path d="M8 9h8M8 13h5" />
{/snippet}
{#snippet file()}
  <path d="M6.5 3.5h7l4 4v13h-11z" />
  <path d="M13.5 3.5v4h4M9 12h6M9 15.5h4" />
{/snippet}
{#snippet check()}
  <path d="m6.5 12.5 3.5 3.5 7.5-8" />
{/snippet}
{#snippet edit()}
  <path d="m4 16.5-.8 4.3 4.3-.8L18.8 8.7l-3.5-3.5z" />
  <path d="m13.8 6.7 3.5 3.5" />
{/snippet}
{#snippet close()}
  <path d="m6 6 12 12M18 6 6 18" />
{/snippet}
{#snippet search()}
  <circle cx="10.75" cy="10.75" r="6.25" />
  <path d="m15.5 15.5 4 4" />
{/snippet}
{#snippet activity()}
  <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />
{/snippet}
{#snippet cpu()}
  <rect x="6" y="6" width="12" height="12" rx="2" />
  <path
    d="M9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"
  />
{/snippet}
{#snippet lock()}
  <rect x="5" y="10" width="14" height="10" rx="2" />
  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
{/snippet}
{#snippet arrowLeft()}
  <path d="m15 18-6-6 6-6" />
{/snippet}
{#snippet plus()}
  <path d="M12 5v14M5 12h14" />
{/snippet}
{#snippet logout()}
  <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
{/snippet}
{#snippet subtitles()}
  <rect x="3" y="5" width="18" height="14" rx="2" />
  <path d="M6.5 11h4M13.5 11h4M6.5 15h7M15.5 15h2" />
{/snippet}
{#snippet chevronDown()}
  <path d="m7 9.5 5 5 5-5" />
{/snippet}
{#snippet play()}
  <path d="m9 7 8 5-8 5z" />
{/snippet}
{#snippet audio()}
  <path d="M5 10v4h3l4 3V7L8 10z" />
  <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
{/snippet}
{#snippet undo()}
  <path d="M9 7 5 11l4 4" />
  <path d="M6 11h7a5 5 0 0 1 5 5v1" />
{/snippet}
{#snippet redo()}
  <path d="m15 7 4 4-4 4" />
  <path d="M18 11h-7a5 5 0 0 0-5 5v1" />
{/snippet}
{#snippet scissors()}
  <circle cx="6" cy="7" r="2.5" />
  <circle cx="6" cy="17" r="2.5" />
  <path d="m8.2 8.2 10.3 7.3M8.2 15.8 18.5 8.5" />
{/snippet}
{#snippet merge()}
  <path d="M6 5v3c0 2.2 1.8 4 4 4h8" />
  <path d="M6 19v-3c0-2.2 1.8-4 4-4M15 9l3 3-3 3" />
{/snippet}
{#snippet trash()}
  <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
{/snippet}
{#snippet download()}
  <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
{/snippet}
{#snippet more()}
  <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
{/snippet}
{#snippet sun()}
  <circle cx="12" cy="12" r="4" />
  <path
    d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
  />
{/snippet}
{#snippet moon()}
  <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
{/snippet}
{#snippet monitor()}
  <rect x="3" y="4.5" width="18" height="12" rx="2" />
  <path d="M8.5 20h7M12 16.5V20" />
{/snippet}
{#snippet pause()}
  <path d="M9 6.5v11M15 6.5v11" />
{/snippet}
{#snippet chevronLeft()}
  <path d="m14.5 7-5 5 5 5" />
{/snippet}
{#snippet chevronRight()}
  <path d="m9.5 7 5 5-5 5" />
{/snippet}
{#snippet skipBack()}
  <path d="M7 6.5v11M17.5 7l-7.5 5 7.5 5z" />
{/snippet}
{#snippet skipForward()}
  <path d="M17 6.5v11M6.5 7l7.5 5-7.5 5z" />
{/snippet}
{#snippet keyboard()}
  <rect x="3" y="6" width="18" height="12" rx="2" />
  <path
    d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M7 14h.01M17 14h.01M10 14h4"
  />
{/snippet}
{#snippet refresh()}
  <path d="M19 12a7 7 0 1 1-2.05-4.95" />
  <path d="M19 4.5v3.5h-3.5" />
{/snippet}
{#snippet zoomIn()}
  <circle cx="10.75" cy="10.75" r="6.25" />
  <path d="m15.5 15.5 4 4M10.75 8v5.5M8 10.75h5.5" />
{/snippet}
{#snippet zoomOut()}
  <circle cx="10.75" cy="10.75" r="6.25" />
  <path d="m15.5 15.5 4 4M8 10.75h5.5" />
{/snippet}
{#snippet fitWidth()}
  <path d="M4 5v14M20 5v14M7.5 12h9M10 9l-2.5 3 2.5 3M14 9l2.5 3-2.5 3" />
{/snippet}
{#snippet alert()}
  <circle cx="12" cy="12" r="8.5" />
  <path d="M12 8v4.5M12 16h.01" />
{/snippet}

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : "true"}
  aria-label={label}
  role={label ? "img" : undefined}
>
  {@render ICONS[name]()}
</svg>
