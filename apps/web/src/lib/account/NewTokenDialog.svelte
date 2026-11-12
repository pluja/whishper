<script lang="ts">
  import { enhance } from "$app/forms";
  import FormMessage from "#lib/admin/FormMessage.svelte";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import { copyText } from "#lib/browser/clipboard.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import { CONTROL_CLASSES } from "#lib/components/ui/variants.ts";
  import {
    API_TOKEN_LIFETIMES,
    API_TOKEN_NAME_MAX_LENGTH,
    API_TOKEN_SCOPE_LABELS,
    API_TOKEN_SCOPES,
    type ApiTokenScope,
  } from "#lib/shared/api-tokens.ts";

  type Props = { open?: boolean };

  let { open = $bindable(false) }: Props = $props();

  const ACCESS_DETAILS: Record<ApiTokenScope, string> = {
    read: "List projects and models, check runs, download subtitles.",
    write:
      "Also upload media, start and cancel transcriptions, delete projects.",
  };

  const formId = $props.id();
  const submission = new FormSubmission();
  let problem = $state<string | null>(null);
  // Shown once; Anysub keeps only a hash of it.
  let created = $state<{ name: string; token: string } | null>(null);
  let copyState = $state<"idle" | "copied" | "failed">("idle");
  let form = $state<HTMLFormElement>();

  function reset(): void {
    form?.reset();
    problem = null;
    created = null;
    copyState = "idle";
  }

  async function copy(token: string): Promise<void> {
    copyState = (await copyText(token)) ? "copied" : "failed";
  }
</script>

<Dialog
  bind:open
  title={created ? "Copy your new token" : "New API token"}
  description={created
    ? "This is the only time Anysub shows it. Store it somewhere safe, such as a password manager."
    : "Scripts that use the token act as you."}
  onclose={reset}
>
  {#if created}
    <div class="grid gap-3">
      <p class="text-sm text-text-muted">
        Token for <strong class="font-medium text-text">{created.name}</strong>
      </p>
      <div class="flex gap-2">
        <Input
          value={created.token}
          readonly
          aria-label="New API token"
          class="font-mono text-xs"
          onfocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="primary"
          onclick={() => created && copy(created.token)}
        >
          <Icon name={copyState === "copied" ? "check" : "copy"} size={16} />
          {copyState === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      {#if copyState === "failed"}
        <p class="text-sm text-danger" role="alert">
          This browser blocked copying. Select the token and copy it yourself.
        </p>
      {/if}
    </div>
  {:else}
    <form
      bind:this={form}
      id={formId}
      method="POST"
      action="?/createApiToken"
      class="grid gap-5"
      use:enhance={submission.handle({
        onsuccess: (data) => {
          if (typeof data?.createdToken === "string") {
            created = {
              token: data.createdToken,
              name: String(data.name ?? ""),
            };
          }
        },
        onfailure: (message) => (problem = message),
      })}
      onsubmit={() => (problem = null)}
    >
      <Field label="Name" hint="What it is for, such as a backup script.">
        {#snippet control({ id, describedBy })}
          <Input
            {id}
            aria-describedby={describedBy}
            name="name"
            maxlength={API_TOKEN_NAME_MAX_LENGTH}
            required
          />
        {/snippet}
      </Field>

      <fieldset class="grid gap-2">
        <legend class="mb-1.5 text-sm font-medium text-text">Access</legend>
        {#each API_TOKEN_SCOPES as scope (scope)}
          <label
            class="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 has-checked:border-accent has-checked:bg-accent-soft"
          >
            <input
              class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              type="radio"
              name="scope"
              value={scope}
              checked={scope === "read"}
            />
            <span class="grid gap-0.5">
              <span class="text-sm font-medium text-text">
                {API_TOKEN_SCOPE_LABELS[scope]}
              </span>
              <span class="text-xs text-text-muted"
                >{ACCESS_DETAILS[scope]}</span
              >
            </span>
          </label>
        {/each}
      </fieldset>

      <Field label="Expires after">
        {#snippet control({ id, describedBy })}
          <select
            {id}
            aria-describedby={describedBy}
            name="lifetime"
            class="{CONTROL_CLASSES} h-9"
          >
            {#each API_TOKEN_LIFETIMES as lifetime (lifetime.label)}
              <option
                value={String(lifetime.days ?? "never")}
                selected={lifetime.days === 90}
              >
                {lifetime.label}
              </option>
            {/each}
          </select>
        {/snippet}
      </Field>

      <Field
        label="Confirm with your password"
        hint="A token outlasts this session, so making one needs your password."
      >
        {#snippet control({ id, describedBy })}
          <Input
            {id}
            aria-describedby={describedBy}
            name="currentPassword"
            type="password"
            autocomplete="current-password"
            required
          />
        {/snippet}
      </Field>

      {#if problem}
        <FormMessage form={{ message: problem }} />
      {/if}
    </form>
  {/if}

  {#snippet actions()}
    {#if created}
      <Button variant="primary" onclick={() => (open = false)}>Done</Button>
    {:else}
      <Button onclick={() => (open = false)}>Cancel</Button>
      <Button
        variant="primary"
        type="submit"
        form={formId}
        loading={submission.busy}
      >
        Create token
      </Button>
    {/if}
  {/snippet}
</Dialog>
