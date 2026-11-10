<script lang="ts">
  type Props = { form: unknown };

  let { form }: Props = $props();

  const message = $derived(
    form && typeof form === "object" && "message" in form
      ? String(form.message)
      : null,
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
  {/if}
</div>
