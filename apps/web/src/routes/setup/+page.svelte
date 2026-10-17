<script lang="ts">
  import AuthLayout from "$lib/components/AuthLayout.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "$lib/shared/limits";

  let { form } = $props();
</script>

<svelte:head>
  <title>Create owner · Anysub</title>
</svelte:head>

<AuthLayout
  title="Create the owner account"
  description="Your media, transcripts, and account data stay on this Anysub server."
>
  <form class="grid gap-4" method="POST">
    <Field
      label="Your name"
      hint="Shown in workspace ownership and activity history."
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="name"
          autocomplete="name"
          required
          minlength={2}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Field
      label="Email address"
      hint="Used to sign in. Anysub does not send email yet."
    >
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="email"
          type="email"
          autocomplete="email"
          required
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Field
      label="Password"
      hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}
      error={form?.message}
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
