<script lang="ts">
  import "../app.css";

  let { data, children } = $props();
</script>

<svelte:head>
  <title>Anysub</title>
  <meta
    name="description"
    content="Private, local transcription and subtitle authoring for creators and teams."
  />
</svelte:head>

<div class="page-shell">
  <header class="app-header">
    <a class="wordmark" href="/">Anysub</a>
    <div class="header-actions">
      {#if data.user}
        <span class="identity">{data.user.email}</span>
        <form method="POST" action="/?/signOut">
          <button class="button secondary" type="submit">Sign out</button>
        </form>
      {/if}
    </div>
  </header>

  <main class="main">
    {@render children()}
  </main>

  <footer class="app-footer">
    <p>Local by default.</p>
    <p>No telemetry.</p>
  </footer>
</div>
