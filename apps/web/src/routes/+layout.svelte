<script lang="ts">
  import "../app.css";
  import Icon from "$lib/components/Icon.svelte";

  let { data, children } = $props();
</script>

<svelte:head>
  <title>Anysub</title>
  <meta
    name="description"
    content="Private, local transcription and subtitle authoring for creators and teams."
  />
</svelte:head>

{#if data.user}
  <div class="application-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Anysub projects">
        <span class="brand-mark"><Icon name="subtitles" size={20} /></span>
        <span>Anysub</span>
      </a>

      <nav class="primary-nav" aria-label="Application">
        <a class="nav-item active" href="/" aria-current="page">
          <Icon name="projects" />
          <span>Projects</span>
        </a>
      </nav>

      <div class="sidebar-foot">
        <div class="privacy-note">
          <span class="privacy-icon"><Icon name="lock" size={16} /></span>
          <div>
            <strong>Private workspace</strong>
            <span>Nothing leaves this installation.</span>
          </div>
        </div>
        <div class="account-row">
          <span class="account-avatar" aria-hidden="true">
            {data.user.email.slice(0, 1).toUpperCase()}
          </span>
          <span class="account-email">{data.user.email}</span>
          <form method="POST" action="/?/signOut">
            <button class="icon-button" type="submit" title="Sign out">
              <Icon name="logout" label="Sign out" />
            </button>
          </form>
        </div>
      </div>
    </aside>

    <div class="application-main">
      <header class="mobile-header">
        <a class="brand" href="/" aria-label="Anysub projects">
          <span class="brand-mark"><Icon name="subtitles" size={18} /></span>
          <span>Anysub</span>
        </a>
        <form method="POST" action="/?/signOut">
          <button class="icon-button" type="submit" title="Sign out">
            <Icon name="logout" label="Sign out" />
          </button>
        </form>
      </header>
      <main class="app-content">
        {@render children()}
      </main>
    </div>
  </div>
{:else}
  <div class="public-shell">
    <header class="public-header">
      <a class="brand" href="/" aria-label="Anysub home">
        <span class="brand-mark"><Icon name="subtitles" size={20} /></span>
        <span>Anysub</span>
      </a>
      <span class="local-badge"><Icon name="lock" size={14} /> Local only</span>
    </header>
    <main class="public-main">
      {@render children()}
    </main>
    <footer class="public-footer">
      <span>Private subtitle production</span>
      <span>No telemetry</span>
    </footer>
  </div>
{/if}
