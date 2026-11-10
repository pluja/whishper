<script lang="ts">
  type Props = { form: unknown; success?: string };

  let { form, success }: Props = $props();

  const message = $derived(
    form && typeof form === "object" && "message" in form
      ? String(form.message)
      : null,
  );
  const done = $derived(
    Boolean(form && typeof form === "object" && "done" in form),
  );
</script>

<div aria-live="polite">
  {#if message}
    <p
      class="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {message}
    </p>
  {:else if done && success}
    <p class="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
      {success}
    </p>
  {/if}
</div>
