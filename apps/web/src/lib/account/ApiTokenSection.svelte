<script lang="ts">
  import { enhance } from "$app/forms";
  import NewTokenDialog from "#lib/account/NewTokenDialog.svelte";
  import FormMessage from "#lib/admin/FormMessage.svelte";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import {
    API_TOKEN_SCOPE_LABELS,
    type ApiTokenSummary,
  } from "#lib/shared/api-tokens.ts";
  import { formatRelativeTime } from "#lib/shared/format.ts";

  type Props = { tokens: ApiTokenSummary[] };

  let { tokens }: Props = $props();

  const revoking = new FormSubmission();
  let creating = $state(false);
  let problem = $state<string | null>(null);
  const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

  // Recomputed whenever the list reloads, so times stay current after each
  // create or revoke.
  const rows = $derived.by(() => {
    const now = new Date();
    return tokens.map((token) => {
      const expired = token.expiresAt !== null && token.expiresAt <= now;
      return {
        ...token,
        expired,
        expiry:
          token.expiresAt === null
            ? "Never expires"
            : `${expired ? "Expired" : "Expires"} ${dateFormat.format(token.expiresAt)}`,
        lastUse:
          token.lastUsedAt === null
            ? "Never used"
            : `Used ${formatRelativeTime(token.lastUsedAt, now)}`,
      };
    });
  });
</script>

<section
  class="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
  aria-labelledby="api-tokens-title"
>
  <header class="flex flex-wrap items-start gap-3">
    <span
      class="hidden size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-text-muted sm:grid"
      aria-hidden="true"
    >
      <Icon name="key" size={18} />
    </span>
    <div class="grid min-w-0 flex-1 gap-1">
      <h2 id="api-tokens-title" class="text-base font-semibold text-text">
        API tokens
      </h2>
      <p class="text-sm text-text-muted">
        Let scripts and other apps use Anysub as you.
        <a
          href="/api"
          class="font-medium whitespace-nowrap text-accent underline-offset-2 hover:underline"
          >API reference</a
        >
      </p>
    </div>
    <Button variant="primary" size="sm" onclick={() => (creating = true)}>
      <Icon name="plus" size={16} />
      New token
    </Button>
  </header>

  {#if problem}
    <FormMessage form={{ message: problem }} />
  {/if}

  {#if rows.length}
    <ul
      class="divide-y divide-border rounded-md border border-border"
      aria-label="Your tokens"
    >
      {#each rows as token (token.id)}
        <li class="flex items-center gap-3 px-3 py-3">
          <div class="grid min-w-0 flex-1 gap-1">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium break-words text-text">
                {token.name}
              </span>
              <Badge tone={token.scope === "write" ? "warning" : "neutral"}>
                {API_TOKEN_SCOPE_LABELS[token.scope]}
              </Badge>
              {#if token.expired}<Badge tone="danger">Expired</Badge>{/if}
            </span>
            <span class="flex flex-wrap gap-x-3 text-xs text-text-muted">
              <code class="font-mono">{token.prefix}…</code>
              <span>{token.expiry}</span>
              <span>{token.lastUse}</span>
            </span>
          </div>
          <form
            method="POST"
            action="?/revokeApiToken"
            use:enhance={revoking.handle({
              confirm: `Revoke ${token.name}? Scripts that use it stop working at once.`,
              onsuccess: () => (problem = null),
              onfailure: (message) => (problem = message),
            })}
          >
            <input type="hidden" name="tokenId" value={token.id} />
            <IconButton
              type="submit"
              icon="trash"
              size="sm"
              label={`Revoke ${token.name}`}
              disabled={revoking.busy}
            />
          </form>
        </li>
      {/each}
    </ul>
  {:else}
    <p
      class="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted"
    >
      No tokens yet. Create one to upload and transcribe from a script.
    </p>
  {/if}
</section>

<NewTokenDialog bind:open={creating} />
