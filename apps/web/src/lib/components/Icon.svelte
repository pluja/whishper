<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconName } from "./icon-names";

  let {
    name,
    size = 18,
    label,
  }: { name: IconName; size?: number; label?: string } = $props();

  const ICONS: Record<IconName, Snippet> = {
    file,
    copy,
    check,
    edit,
    close,
    search,
    activity,
    cpu,
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
    globe,
    playhead,
    key,
    shield,
    settings,
    cube,
    sliders,
    "hard-drive": hardDrive,
    server,
    gauge,
    compress,
    target,
    upload,
    database,
    image,
    film,
    clock,
    "check-circle": checkCircle,
    words,
  };
</script>

{#snippet file()}
  <path d="M6.5 3.5h7l4 4v13h-11z" />
  <path d="M13.5 3.5v4h4M9 12h6M9 15.5h4" />
{/snippet}
{#snippet copy()}
  <rect x="8" y="8" width="13" height="13" rx="2" />
  <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
{/snippet}
{#snippet key()}
  <circle cx="8" cy="15.5" r="4" />
  <path d="m10.8 12.7 8.7-8.7M16.5 7l2.5 2.5M14 9.5l2 2" />
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
{#snippet globe()}
  <circle cx="12" cy="12" r="8.5" />
  <path
    d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.1 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.1-3.4-8.5s1.2-6.2 3.4-8.5z"
  />
{/snippet}
{#snippet playhead()}
  <path d="M8 4h8v4l-4 3.5L8 8z" />
  <path d="M12 11.5V20" />
{/snippet}
{#snippet shield()}
  <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z" />
  <path d="m9 12 2 2 4-4" />
{/snippet}
<!-- Lucide's settings icon, under the ISC License in LICENSE-lucide. -->
{#snippet settings()}
  <path
    d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
  />
  <circle cx="12" cy="12" r="3" />
{/snippet}
{#snippet cube()}
  <path d="M12 3 4.5 7v10l7.5 4 7.5-4V7z" />
  <path d="M4.5 7 12 11l7.5-4M12 11v10" />
{/snippet}
{#snippet sliders()}
  <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
  <circle cx="15" cy="7" r="2" />
  <circle cx="9" cy="17" r="2" />
{/snippet}
{#snippet hardDrive()}
  <rect x="3" y="13" width="18" height="7" rx="2" />
  <path d="M5.5 13 8 5h8l2.5 8M7 16.5h.01M10.5 16.5h.01" />
{/snippet}
{#snippet server()}
  <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
  <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
  <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" />
{/snippet}
{#snippet gauge()}
  <path d="M4.8 18a8.5 8.5 0 1 1 14.4 0" />
  <path d="m12 14 4-5M12 6.5v1.5M6.5 12H8M16 12h1.5" />
{/snippet}
{#snippet compress()}
  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
{/snippet}
{#snippet target()}
  <circle cx="12" cy="12" r="8.5" />
  <circle cx="12" cy="12" r="5" />
  <circle cx="12" cy="12" r="1.5" />
{/snippet}
{#snippet upload()}
  <path d="M12 15V4m0 0-4 4m4-4 4 4M5 19h14" />
{/snippet}
{#snippet database()}
  <ellipse cx="12" cy="6" rx="7" ry="2.5" />
  <path
    d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"
  />
{/snippet}
{#snippet image()}
  <rect x="3.5" y="5" width="17" height="14" rx="2" />
  <circle cx="9" cy="10" r="1.5" />
  <path d="m20.5 16-5-5-8 8" />
{/snippet}
{#snippet film()}
  <rect x="3.5" y="4" width="17" height="16" rx="2" />
  <path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
{/snippet}
{#snippet clock()}
  <circle cx="12" cy="12" r="8.5" />
  <path d="M12 7.5V12l3 2" />
{/snippet}
{#snippet checkCircle()}
  <circle cx="12" cy="12" r="8.5" />
  <path d="m8.5 12.5 2.5 2.5 4.5-5" />
{/snippet}
{#snippet words()}
  <path d="M4 18h16" />
  <rect x="4" y="7" width="4.5" height="7" rx="1" />
  <rect x="10.5" y="7" width="3" height="7" rx="1" />
  <rect x="15.5" y="7" width="4.5" height="7" rx="1" />
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
