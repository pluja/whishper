<script lang="ts">
  import AuthLayout from "$lib/components/AuthLayout.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";

  let { form } = $props();
</script>

<svelte:head>
  <title>Sign in · Anysub</title>
</svelte:head>

<AuthLayout
  title="Sign in"
  description="Use the credentials for this installation."
>
  <form class="grid gap-4" method="POST">
    <Field label="Email address">
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

    <Field label="Password" error={form?.message}>
      {#snippet control({ id, describedBy, invalid })}
        <Input
          {id}
          name="password"
          type="password"
          autocomplete="current-password"
          required
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Button variant="primary" type="submit" class="mt-2 w-full">Sign in</Button>
  </form>
</AuthLayout>
