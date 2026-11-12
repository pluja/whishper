<script lang="ts">
  import AuthLayout from "#lib/components/AuthLayout.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import {
    OWNER_NAME_MAX_LENGTH,
    OWNER_NAME_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
  } from "#lib/shared/limits.ts";

  let { form } = $props();

  const errorFor = (field: string) =>
    form?.field === field ? form.message : undefined;
</script>

<svelte:head>
  <title>Create owner · Anysub</title>
</svelte:head>

{#snippet setupCodeHint()}
  Anysub prints it in its log at startup. On the server, run
  <code class="font-mono text-text">docker compose logs web</code> to see it.
{/snippet}

<AuthLayout
  title="Create the owner account"
  description="Your media, transcripts, and account data stay on this Anysub server."
>
  <form class="grid gap-4" method="POST">
    <Field
      label="Setup code"
      hint={setupCodeHint}
      error={errorFor("setupCode")}
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="setupCode"
          autocomplete="off"
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

    <Field
      label="Your name"
      hint="Shown in workspace ownership and activity history."
      error={errorFor("name")}
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="name"
          autocomplete="name"
          required
          minlength={OWNER_NAME_MIN_LENGTH}
          maxlength={OWNER_NAME_MAX_LENGTH}
          value={form?.name ?? ""}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Field
      label="Email address"
      hint="Used to sign in. Anysub does not send email yet."
      error={errorFor("email")}
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="email"
          type="email"
          autocomplete="email"
          required
          value={form?.email ?? ""}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Field
      label="Password"
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

    <Button variant="primary" type="submit" class="mt-2 w-full">
      Create workspace
    </Button>
  </form>
</AuthLayout>
