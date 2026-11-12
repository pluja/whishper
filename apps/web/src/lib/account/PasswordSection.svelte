<script lang="ts">
  import { enhance } from "$app/forms";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
  } from "#lib/shared/limits.ts";

  const formId = $props.id();
  let open = $state(false);
  let busy = $state(false);
  let changed = $state(false);
  let problem = $state<{ field: string; message: string } | null>(null);
  let form = $state<HTMLFormElement>();

  function reset(): void {
    form?.reset();
    problem = null;
  }

  const errorFor = (field: string) =>
    problem?.field === field ? problem.message : undefined;
</script>

<section
  class="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5"
  aria-labelledby="password-title"
>
  <span
    class="hidden size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-text-muted sm:grid"
    aria-hidden="true"
  >
    <Icon name="shield" size={18} />
  </span>
  <div class="grid min-w-0 flex-1 gap-1">
    <h2 id="password-title" class="text-base font-semibold text-text">
      Password
    </h2>
    <p class="text-sm text-text-muted">
      {#if changed}
        <span
          class="inline-flex items-center gap-1.5 text-success"
          role="status"
        >
          <Icon name="check-circle" size={16} />
          Changed. Other devices are signed out and your API tokens revoked.
        </span>
      {:else}
        Changing it signs out your other devices and revokes your API tokens.
      {/if}
    </p>
  </div>
  <Button size="sm" onclick={() => (open = true)}>Change password</Button>
</section>

<Dialog bind:open title="Change password" onclose={reset}>
  <form
    bind:this={form}
    id={formId}
    method="POST"
    action="?/changePassword"
    class="grid gap-4"
    use:enhance={() => {
      busy = true;
      problem = null;
      return async ({ result, update }) => {
        busy = false;
        if (result.type === "failure") {
          problem = {
            field: String(result.data?.field ?? ""),
            message: String(result.data?.message ?? "That did not work."),
          };
          return;
        }
        await update();
        if (result.type === "success") {
          changed = true;
          open = false;
        }
      };
    }}
  >
    <Field label="Current password" error={errorFor("currentPassword")}>
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="currentPassword"
          type="password"
          autocomplete="current-password"
          required
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>
    <Field
      label="New password"
      hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}
      error={errorFor("newPassword")}
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="newPassword"
          type="password"
          autocomplete="new-password"
          required
          minlength={PASSWORD_MIN_LENGTH}
          maxlength={PASSWORD_MAX_LENGTH}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>
    <Field label="Repeat the new password" error={errorFor("confirmation")}>
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="confirmation"
          type="password"
          autocomplete="new-password"
          required
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>
  </form>

  {#snippet actions()}
    <Button onclick={() => (open = false)}>Cancel</Button>
    <Button variant="primary" type="submit" form={formId} loading={busy}>
      Change password
    </Button>
  {/snippet}
</Dialog>
