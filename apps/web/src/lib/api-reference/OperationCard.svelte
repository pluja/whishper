<script lang="ts">
  import CodeBlock from "#lib/api-reference/CodeBlock.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import type { BadgeTone } from "#lib/components/ui/variants.ts";
  import type { ReferenceOperation } from "#lib/shared/api-reference.ts";
  import { INLINE_CODE } from "#lib/api-reference/code.ts";

  type Props = { operation: ReferenceOperation };

  let { operation }: Props = $props();

  const METHOD_TONES: Record<ReferenceOperation["method"], BadgeTone> = {
    GET: "success",
    POST: "accent",
    DELETE: "danger",
  };
</script>

<article
  id={operation.id}
  class="grid scroll-mt-20 gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
  aria-labelledby="{operation.id}-title"
>
  <header class="grid gap-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <Badge tone={METHOD_TONES[operation.method]}>{operation.method}</Badge>
      <code class="font-mono text-sm break-all text-text">{operation.path}</code
      >
      <span class="ml-auto">
        <Badge tone="neutral">
          {operation.scope === "write" ? "Read and write token" : "Any token"}
        </Badge>
      </span>
    </div>
    <h3 id="{operation.id}-title" class="text-base font-semibold text-text">
      {operation.summary}
    </h3>
    {#if operation.description}
      <p class="text-sm text-text-muted">{operation.description}</p>
    {/if}
  </header>

  {#if operation.parameters.length}
    <div class="grid gap-2">
      <h4 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
        Parameters
      </h4>
      <dl class="grid gap-2 text-sm">
        {#each operation.parameters as parameter (parameter.name)}
          <div class="grid gap-0.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-3">
            <dt class="flex flex-wrap items-center gap-1.5">
              <code class="font-mono text-text">{parameter.name}</code>
              <span class="text-xs text-text-subtle">
                {parameter.location}{parameter.required ? ", required" : ""}
              </span>
            </dt>
            <dd class="text-text-muted">
              <code class="font-mono text-xs">{parameter.type}</code>
              {#if parameter.description}<span>. {parameter.description}</span
                >{/if}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/if}

  {#if operation.body}
    <div class="grid gap-1">
      <h4 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
        Body
      </h4>
      <p class="text-sm text-text-muted">
        <code class={INLINE_CODE}>{operation.body.contentType}</code>.
        {operation.body.description}
        {#if operation.body.schema}
          See <a
            class="font-medium text-accent underline-offset-2 hover:underline"
            href="#schema-{operation.body.schema}">{operation.body.schema}</a
          >.
        {/if}
      </p>
    </div>
  {/if}

  <div class="grid gap-2">
    <h4 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
      Responses
    </h4>
    <ul class="grid gap-1 text-sm">
      {#each operation.responses as response (response.status)}
        <li class="flex flex-wrap gap-x-2">
          <code class="font-mono text-text">{response.status}</code>
          <span class="text-text-muted">{response.description}</span>
          {#if response.schema}
            <a
              class="font-medium text-accent underline-offset-2 hover:underline"
              href="#schema-{response.schema}">{response.schema}</a
            >
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <CodeBlock code={operation.curl} label="Example request" />
</article>
