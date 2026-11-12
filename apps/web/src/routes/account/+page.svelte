<script lang="ts">
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
  } from "#lib/shared/limits.ts";

  let { data, form } = $props();

  const errorFor = (field: string) =>
    form && "field" in form && form.field === field ? form.message : undefined;
</script>

<svelte:head>
  <title>Account · Anysub</title>
</svelte:head>

<div class="mx-auto grid max-w-md gap-6 py-10">
  <div>
    <h1 class="text-xl font-semibold tracking-tight">Account</h1>
    <p class="mt-1.5 text-sm text-text-muted">
      Signed in as {data.user?.email}.
    </p>
  </div>

  <section
    class="rounded-lg border border-border bg-surface p-6"
    aria-labelledby="change-password-title"
  >
    <h2 id="change-password-title" class="text-base font-semibold">
      Change password
    </h2>
    <p class="mt-1 text-sm text-text-muted">
      Other devices are signed out when the password changes.
    </p>
    {#if form && "changed" in form}
      <p
        class="mt-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-text"
        role="status"
      >
        Your password was changed.
      </p>
    {/if}
    <form class="mt-4 grid gap-4" method="POST" action="?/changePassword">
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

      <Button variant="primary" type="submit" class="mt-2 justify-self-start">
        Change password
      </Button>
    </form>
  </section>
</div>
