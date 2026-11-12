<script lang="ts">
  import type { WorkerDevice } from "@anysub/contracts";
  import Icon from "#lib/components/Icon.svelte";
  import type { IconName } from "#lib/components/icon-names.ts";
  import Badge from "#lib/components/ui/Badge.svelte";
  import {
    PRECISION_COMPUTE_TYPES,
    type Precision,
  } from "#lib/shared/instance-settings.ts";

  type Option = {
    value: Precision;
    label: string;
    icon: IconName;
    description: string;
  };

  const OPTIONS: Option[] = [
    {
      value: "auto",
      label: "Automatic",
      icon: "gauge",
      description: "The fastest weights each worker runs well.",
    },
    {
      value: "memory",
      label: "Lower memory",
      icon: "compress",
      description:
        "For graphics cards that run out of memory with the larger models.",
    },
    {
      value: "precise",
      label: "Full precision",
      icon: "target",
      description:
        "Slowest, with about twice the memory. Rarely more accurate.",
    },
  ];
  const DEVICE_NAMES: Record<WorkerDevice, string> = {
    cpu: "Processor",
    cuda: "Graphics card",
  };

  type Props = { initial: Precision; devices: WorkerDevice[] };

  let { initial, devices }: Props = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initial);

  const shownDevices = $derived<WorkerDevice[]>(
    devices.length ? devices : ["cpu", "cuda"],
  );

  type Effect = { device: string | null; computeType: string }[];

  // One line per connected device kind, or one shared line when they agree.
  function effects(precision: Precision): Effect {
    const types = PRECISION_COMPUTE_TYPES[precision];
    const distinct = new Set(shownDevices.map((device) => types[device]));
    if (distinct.size === 1 && shownDevices.length > 1) {
      return [{ device: null, computeType: [...distinct][0] }];
    }
    return shownDevices.map((device) => ({
      device: DEVICE_NAMES[device],
      computeType: types[device],
    }));
  }

  function sameAsAutomatic(precision: Precision): boolean {
    return (
      precision !== "auto" &&
      JSON.stringify(effects(precision)) === JSON.stringify(effects("auto"))
    );
  }
</script>

<fieldset class="grid gap-2 sm:grid-cols-3">
  <legend class="sr-only">Precision</legend>
  {#each OPTIONS as option (option.value)}
    {@const selected = value === option.value}
    <label
      class="relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus motion-reduce:transition-none {selected
        ? 'border-accent ring-1 ring-accent'
        : 'border-border-strong hover:bg-surface-sunken'}"
    >
      <input
        type="radio"
        name="precision"
        value={option.value}
        bind:group={value}
        class="sr-only"
      />
      <span class="flex items-center gap-2">
        <span class={selected ? "text-accent" : "text-text-muted"}>
          <Icon name={option.icon} size={18} />
        </span>
        <strong class="text-sm font-semibold text-text">{option.label}</strong>
        {#if option.value === "auto"}
          <Badge tone="accent">Recommended</Badge>
        {/if}
        {#if selected}
          <span class="ml-auto text-accent">
            <Icon name="check-circle" size={16} />
          </span>
        {/if}
      </span>
      <span class="text-xs text-text-muted">{option.description}</span>
      <span class="mt-auto grid gap-0.5 text-xs text-text-subtle">
        {#each effects(option.value) as line (line.device)}
          <span>
            {#if line.device}{line.device}:{/if}
            <code class="font-mono">{line.computeType}</code>
          </span>
        {/each}
        {#if sameAsAutomatic(option.value)}
          <span>The same as Automatic on these workers.</span>
        {/if}
      </span>
    </label>
  {/each}
</fieldset>
