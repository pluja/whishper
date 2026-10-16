<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Create owner · Anysub</title>
</svelte:head>

<div class="auth-layout">
  <section class="auth-context" aria-labelledby="setup-title">
    <p class="eyebrow">First-run setup</p>
    <h1 id="setup-title">Your private subtitle workspace.</h1>
    <p>
      Create the installation owner. Your media, transcripts, and account data
      remain on this Anysub server.
    </p>
    <ul class="auth-promises">
      <li><span>01</span> Local processing by default</li>
      <li><span>02</span> No telemetry or external account</li>
      <li><span>03</span> One secure owner to begin</li>
    </ul>
  </section>

  <section class="auth-card" aria-label="Create owner account">
    <div class="auth-card-heading">
      <p class="eyebrow">Installation owner</p>
      <h2>Create your account</h2>
      <p>You can invite workspace members in a later release.</p>
    </div>

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
        <p class="helper">Shown in workspace ownership and activity history.</p>
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
        <p class="helper">Used to sign in. Anysub does not send email yet.</p>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
          required
          minlength={data.minPasswordLength}
          maxlength={data.maxPasswordLength}
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

      <button class="button wide" type="submit">Create workspace</button>
    </form>
  </section>
</div>
