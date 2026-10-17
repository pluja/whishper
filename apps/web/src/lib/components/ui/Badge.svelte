<script lang="ts">
  import type { Snippet } from "svelte";
  import { badgeClasses, type BadgeTone } from "./variants";

  type Props = { tone: BadgeTone; children: Snippet };

  let { tone, children }: Props = $props();
</script>

<span class={badgeClasses(tone)}>{@render children()}</span>
