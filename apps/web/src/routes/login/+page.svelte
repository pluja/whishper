<script lang="ts">
  let { form } = $props();
</script>

<svelte:head>
  <title>Sign in · Anysub</title>
</svelte:head>

<div class="auth-layout">
  <section class="auth-context" aria-labelledby="login-title">
    <p class="eyebrow">Local workspace</p>
    <h1 id="login-title">Welcome back.</h1>
    <p>
      Continue transcribing, reviewing, and preparing subtitles without sending
      your media to an external service.
    </p>
    <div class="auth-assurance">
      <span><strong>Private</strong> Your installation</span>
      <span><strong>Local</strong> Your infrastructure</span>
    </div>
  </section>

  <section class="auth-card" aria-label="Sign in">
    <div class="auth-card-heading">
      <p class="eyebrow">Anysub account</p>
      <h2>Sign in</h2>
      <p>Use the credentials for this installation.</p>
    </div>

    <form class="auth-form" method="POST">
      <div class="field">
        <label for="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          aria-describedby="login-error"
          aria-invalid={form?.message ? "true" : "false"}
        />
        <p
          id="login-error"
          class="helper"
          class:error={form?.message}
          role="alert"
        >
          {form?.message ?? ""}
        </p>
      </div>

      <button class="button wide" type="submit">Open workspace</button>
    </form>
  </section>
</div>
