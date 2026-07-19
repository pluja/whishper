<script lang="ts">
  let { form } = $props();
</script>

<svelte:head>
  <title>Create owner · Anysub</title>
</svelte:head>

<div class="auth-wrap">
  <section class="auth-panel">
    <h1>Create the owner account.</h1>
    <p>
      This account controls the local installation. Authentication always stays
      enabled.
    </p>

    <form class="auth-form" method="POST">
      <div class="field">
        <label for="name">Your name</label>
        <input
          id="name"
          name="name"
          autocomplete="name"
          required
          minlength="2"
        />
        <p class="helper">Used for workspace ownership and audit history.</p>
      </div>

      <div class="field">
        <label for="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
        />
        <p class="helper">No mail is sent in this release.</p>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
          required
          minlength="10"
          maxlength="128"
          aria-describedby="setup-error"
          aria-invalid={form?.message ? "true" : "false"}
        />
        <p
          id="setup-error"
          class="helper"
          class:error={form?.message}
          role="alert"
        >
          {form?.message ?? "Use at least ten characters."}
        </p>
      </div>

      <button class="button" type="submit">Create owner</button>
    </form>
  </section>
</div>
