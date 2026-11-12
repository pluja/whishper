<script lang="ts">
  import CodeBlock from "#lib/api-reference/CodeBlock.svelte";
  import { INLINE_CODE } from "#lib/api-reference/code.ts";
  import OperationCard from "#lib/api-reference/OperationCard.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";

  let { data } = $props();

  const tags = $derived([
    ...new Set(data.reference.operations.map((operation) => operation.tag)),
  ]);
  function curlFor(operationId: string): string {
    const operation = data.reference.operations.find(
      (candidate) => candidate.id === operationId,
    );
    if (!operation) throw new Error(`Unknown operation ${operationId}.`);
    return operation.curl;
  }

  const steps = $derived([
    {
      title: "Upload a file",
      text: "The answer is the new project. Media preparation starts on its own.",
      code: curlFor("createProject"),
    },
    {
      title: "Start a transcription",
      text: "Pick a model id from GET /models. Options you leave out use the server's defaults.",
      code: curlFor("startTranscription"),
    },
    {
      title: "Wait, then download",
      text: "Poll the transcription until its status is completed, then export the track it made.",
      code: `${curlFor("getTranscription")}\n\n${curlFor("exportTrack")}`,
    },
  ]);
</script>

<svelte:head>
  <title>API reference · Anysub</title>
</svelte:head>

<div
  class="grid gap-8 py-8 sm:py-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
>
  <nav aria-label="API reference" class="hidden lg:block">
    <div class="sticky top-6 grid gap-5 text-sm">
      <a
        href="#start"
        class="font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >Quick start</a
      >
      {#each tags as tag (tag)}
        <div class="grid gap-1.5">
          <a
            href="#tag-{tag}"
            class="font-medium text-text hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >{tag}</a
          >
          <ul class="grid gap-1 border-l border-border pl-3">
            {#each data.reference.operations.filter((operation) => operation.tag === tag) as operation (operation.id)}
              <li>
                <a
                  href="#{operation.id}"
                  class="flex items-baseline gap-2 text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span
                    class="w-11 shrink-0 font-mono text-[0.7rem] font-semibold"
                    >{operation.method}</span
                  >
                  <span class="min-w-0">{operation.summary}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      <a
        href="#schemas"
        class="font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >Data shapes</a
      >
    </div>
  </nav>

  <div class="grid min-w-0 gap-10">
    <header class="grid gap-3">
      <h1 class="text-xl font-semibold tracking-tight text-text">
        API reference
      </h1>
      <p class="max-w-2xl text-sm text-text-muted">
        Upload media, transcribe it and download subtitles from scripts and
        other apps. This page describes Anysub {data.reference.version}.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button href="/account" variant="primary" size="sm">
          <Icon name="key" size={16} />
          Create a token
        </Button>
        <Button href="/api/v1/openapi.json" size="sm">
          <Icon name="file" size={16} />
          OpenAPI document
        </Button>
      </div>
    </header>

    <section
      id="start"
      class="grid scroll-mt-6 gap-4"
      aria-labelledby="start-title"
    >
      <div class="grid gap-1">
        <h2 id="start-title" class="text-lg font-semibold text-text">
          Quick start
        </h2>
        <p class="text-sm text-text-muted">
          Set <code class={INLINE_CODE}>ANYSUB_TOKEN</code> to a token that can read
          and write, then go from a file to subtitles in three requests.
        </p>
      </div>
      <ol class="grid gap-4">
        {#each steps as step, index (step.title)}
          <li
            class="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[2rem_minmax(0,1fr)] sm:p-5"
          >
            <span
              class="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
              aria-hidden="true">{index + 1}</span
            >
            <div class="grid min-w-0 gap-2">
              <div>
                <h3 class="text-sm font-semibold text-text">{step.title}</h3>
                <p class="mt-0.5 text-sm text-text-muted">{step.text}</p>
              </div>
              <CodeBlock code={step.code} label={`${step.title} example`} />
            </div>
          </li>
        {/each}
      </ol>
    </section>

    <section class="grid gap-3" aria-labelledby="notes-title">
      <h2 id="notes-title" class="text-lg font-semibold text-text">
        Good to know
      </h2>
      <dl
        class="divide-y divide-border rounded-lg border border-border bg-surface text-sm"
      >
        <div class="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt class="font-medium text-text">Tokens</dt>
          <dd class="text-text-muted">
            Send <code class={INLINE_CODE}
              >Authorization: Bearer anysub_pat_…</code
            >. A token acts as you, in every workspace you belong to. Read-only
            tokens can only look.
          </dd>
        </div>
        <div class="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt class="font-medium text-text">Errors</dt>
          <dd class="text-text-muted">
            Always <code class={INLINE_CODE}
              >{"{"}"error": {"{"}"code", "message"{"}"}{"}"}</code
            >, with a fitting HTTP status. The message is safe to show.
          </dd>
        </div>
        <div class="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt class="font-medium text-text">Times</dt>
          <dd class="text-text-muted">
            Microseconds from the start of the media:
            <code class={INLINE_CODE}>1500000</code> is 1.5 seconds.
          </dd>
        </div>
        <div class="grid gap-1 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt class="font-medium text-text">Large files</dt>
          <dd class="text-text-muted">
            Uploading in one request works up to the server's request limit.
            Beyond that, use the resumable <a
              class="font-medium text-accent underline-offset-2 hover:underline"
              href="https://tus.io">tus</a
            >
            upload at <code class={INLINE_CODE}>/api/uploads</code> with
            metadata
            <code class={INLINE_CODE}>filename</code> and
            <code class={INLINE_CODE}>workspaceId</code> from
            <code class={INLINE_CODE}>GET /me</code>. The new project's id comes
            back in the <code class={INLINE_CODE}>Upload-Project</code> header.
          </dd>
        </div>
      </dl>
    </section>

    {#each tags as tag (tag)}
      <section class="grid gap-3" aria-labelledby="tag-{tag}">
        <h2 id="tag-{tag}" class="scroll-mt-6 text-lg font-semibold text-text">
          {tag}
        </h2>
        {#each data.reference.operations.filter((operation) => operation.tag === tag) as operation (operation.id)}
          <OperationCard {operation} />
        {/each}
      </section>
    {/each}

    <section class="grid gap-3" aria-labelledby="schemas">
      <h2 id="schemas" class="scroll-mt-6 text-lg font-semibold text-text">
        Data shapes
      </h2>
      {#each data.reference.schemas as schema (schema.name)}
        <details
          id="schema-{schema.name}"
          class="scroll-mt-6 rounded-lg border border-border bg-surface"
        >
          <summary
            class="cursor-pointer px-4 py-2.5 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {schema.name}
          </summary>
          <pre
            class="border-t border-border p-4 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text-muted"><code
              >{schema.json}</code
            ></pre>
        </details>
      {/each}
    </section>
  </div>
</div>
