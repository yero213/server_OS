<script>
import { onMount } from "svelte";
import { getSetupStatus, postSetup } from "$lib/auth";

let state = "checking";
let setupToken = "";
let username = "";
let password = "";
let error = "";
let busy = false;

onMount(async () => {
  try {
    const s = await getSetupStatus();
    state = s.needsSetup ? "form" : "done";
  } catch (e) {
    error = "API unreachable: " + (e?.message ?? e);
    state = "error";
  }
});

async function submit() {
  error = "";
  if (!setupToken.trim()) {
    error = "Paste the setup token from /var/lib/serveros/setup-token.txt (sudo cat).";
    return;
  }
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
    error = "Username: 3–64 chars, letters/digits plus . _ - only.";
    return;
  }
  if (password.length < 12) {
    error = "Password must be at least 12 characters.";
    return;
  }
  busy = true;
  try {
    const r = await postSetup(setupToken.trim(), username, password);
    if (r.ok) {
      window.location.assign("/");
      return;
    }
    if (r.error === "setupAlreadyComplete") {
      state = "done";
      return;
    }
    error =
      r.error === "invalidSetupToken"
        ? "Invalid or expired setup token (single-use, 30 min). Restart serveros-api for a fresh one."
        : r.error === "rateLimited"
          ? "Too many attempts — wait a few minutes and try again."
          : "Setup failed (" + r.error + ").";
  } finally {
    busy = false;
  }
}
</script>

<main class="narrow">
  <header class="top">
    <div class="logo">▦</div>
    <div>
      <h1>Server OS</h1>
      <div class="sub">First-run setup <span class="badge">Phase 2 / Auth</span></div>
    </div>
  </header>

  {#if state === "checking"}
    <div class="card"><div class="big">Loading…</div></div>
  {:else if state === "error"}
    <div class="error">{error}</div>
    <p><a href="/">← Back to dashboard</a></p>
  {:else if state === "done"}
    <div class="card">
      <h2>Setup already complete</h2>
      <div class="big ok">Admin exists</div>
      <p class="sub">This server already has an administrator. No setup token is accepted anymore.</p>
      <p><a href="/login">Log in →</a> · <a href="/">← Back to dashboard</a></p>
    </div>
  {:else}
    <div class="card form-card">
      <h2>Create the first administrator</h2>
      <p class="sub">
        Single-use token from <code>/var/lib/serveros/setup-token.txt</code>
        (<code>sudo cat</code> on the server). Delete the file after use.
      </p>
      <label>Setup token<input type="text" bind:value={setupToken} autocomplete="off" spellcheck="false" /></label>
      <label>Username<input type="text" bind:value={username} autocomplete="username" /></label>
      <label>Password (≥ 12 chars)<input type="password" bind:value={password} autocomplete="new-password" /></label>
      {#if error}<div class="error">{error}</div>{/if}
      <button disabled={busy} on:click={submit}>{busy ? "Creating…" : "Create admin"}</button>
      <p><a href="/">← Back to dashboard</a></p>
    </div>
  {/if}
</main>
