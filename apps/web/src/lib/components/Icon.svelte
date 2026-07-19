<script lang="ts">
  let {
    name,
    size = 18,
    label,
  }: { name: string; size?: number; label?: string } = $props();
</script>

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
  {#if name === "projects"}
    <path d="M4 5.5h16v13H4z" />
    <path d="M8 9h8M8 13h5" />
  {:else if name === "upload"}
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M5 15.5V20h14v-4.5" />
  {:else if name === "file"}
    <path d="M6.5 3.5h7l4 4v13h-11z" />
    <path d="M13.5 3.5v4h4M9 12h6M9 15.5h4" />
  {:else if name === "check"}
    <path d="m6.5 12.5 3.5 3.5 7.5-8" />
  {:else if name === "activity"}
    <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />
  {:else if name === "lock"}
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  {:else if name === "arrow-left"}
    <path d="m15 18-6-6 6-6" />
  {:else if name === "plus"}
    <path d="M12 5v14M5 12h14" />
  {:else if name === "logout"}
    <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
  {:else if name === "subtitles"}
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M6.5 11h4M13.5 11h4M6.5 15h7M15.5 15h2" />
  {:else if name === "chevron-down"}
    <path d="m7 9.5 5 5 5-5" />
  {:else if name === "play"}
    <path d="m9 7 8 5-8 5z" />
  {:else if name === "audio"}
    <path d="M5 10v4h3l4 3V7L8 10z" />
    <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
  {:else if name === "undo"}
    <path d="M9 7 5 11l4 4" />
    <path d="M6 11h7a5 5 0 0 1 5 5v1" />
  {:else if name === "redo"}
    <path d="m15 7 4 4-4 4" />
    <path d="M18 11h-7a5 5 0 0 0-5 5v1" />
  {:else if name === "scissors"}
    <circle cx="6" cy="7" r="2.5" />
    <circle cx="6" cy="17" r="2.5" />
    <path d="m8.2 8.2 10.3 7.3M8.2 15.8 18.5 8.5" />
  {:else if name === "merge"}
    <path d="M6 5v3c0 2.2 1.8 4 4 4h8" />
    <path d="M6 19v-3c0-2.2 1.8-4 4-4M15 9l3 3-3 3" />
  {:else if name === "trash"}
    <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
  {:else if name === "download"}
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
  {:else}
    <circle cx="12" cy="12" r="8" />
  {/if}
</svg>
