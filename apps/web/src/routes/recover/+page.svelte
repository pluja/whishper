<script lang="ts">
  import AuthLayout from "$lib/components/AuthLayout.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    RECOVERY_CODE_LIFETIME_MINUTES,
  } from "$lib/shared/limits";

  let { form } = $props();

  const errorFor = (field: string) =>
    form && "field" in form && form.field === field ? form.message : undefined;
</script>

<svelte:head>
  <title>Reset password · Anysub</title>
</svelte:head>

<AuthLayout
  title="Reset your password"
  description="Anysub sends no email. To prove you run this server, it prints a recovery code in its log instead."
>
  {#if form?.requested}
    <p class="mb-4 text-sm text-text-muted">
      Anysub printed a recovery code in its log. On the server, run
      <code class="font-mono text-text">docker compose logs web</code> to see
      it. The code works for {RECOVERY_CODE_LIFETIME_MINUTES} minutes.
    </p>
    <form class="grid gap-4" method="POST" action="?/reset">
      <Field label="Recovery code" error={errorFor("recoveryCode")}>
        {#snippet control({ id, describedBy, invalid })}
          <Input
            {id}
            name="recoveryCode"
            autocomplete="one-time-code"
            autocapitalize="characters"
            spellcheck="false"
            required
            placeholder="XXXX-XXXX-XXXX"
            class="font-mono"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        {/snippet}
      </Field>

      <Field label="Email address" error={errorFor("email")}>
        {#snippet control({ id, describedBy, invalid })}
          <Input
            {id}
            name="email"
            type="email"
            autocomplete="username"
            required
            value={form && "email" in form ? form.email : ""}
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        {/snippet}
      </Field>

      <Field
        label="New password"
        hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errorFor("password")}
      >
        {#snippet control({ id, describedBy, invalid })}
          <Input
            {id}
            name="password"
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

      <Button variant="primary" type="submit" class="mt-2 w-full">
        Set new password
      </Button>
    </form>
    <form method="POST" action="?/request" class="mt-3">
      <Button type="submit" variant="ghost" class="w-full">
        Print the code again
      </Button>
    </form>
  {:else}
    <form method="POST" action="?/request">
      <Button variant="primary" type="submit" class="w-full">
        Print a recovery code
      </Button>
    </form>
  {/if}
  <p class="mt-4 text-center text-sm">
    <a
      href="/login"
      class="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Back to sign in
    </a>
  </p>
</AuthLayout>
