<script lang="ts">
  let { form } = $props();
</script>

<svelte:head>
  <title>Sign in · Anysub</title>
</svelte:head>

<div class="auth-wrap">
  <section class="auth-panel">
    <h1>Sign in.</h1>
    <p>Open the local subtitle workspace.</p>

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
        <p class="helper"></p>
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

      <button class="button" type="submit">Sign in</button>
    </form>
  </section>
</div>
