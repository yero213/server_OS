<script>
import { onMount } from "svelte";
import { getMe, postLogin } from "$lib/auth";

let state = "checking";
let username = "";
let password = "";
let error = "";
let busy = false;

onMount(async () => {
  try {
    const me = await getMe();
    if (me.authenticated) {
      window.location.assign("/");
      return;
    }
  } catch {
    /* /me failing just means: show the form anyway */
  }
  state = "form";
});

async function submit() {
  error = "";
  if (!username || !password) {
    error = "Enter both username and password.";
    return;
  }
  busy = true;
  try {
    const r = await postLogin(username, password);
    if (r.ok) {
      window.location.assign("/");
      return;
    }
    error =
      r.status === 429
        ? "Too many attempts — wait a few minutes and try again."
        : "Invalid username or password.";
  } finally {
    busy = false;
  }
}
</script>

<main>
  <header class="top">
    <div class="logo">▦</div>
    <div>
      <h1>Server OS</h1>
      <div class="sub">Log in <span class="badge">Phase 2 / Auth</span></div>
    </div>
  </header>

  {#if state === "checking"}
    <div class="card"><div class="big">Loading…</div></div>
  {:else}
    <div class="card form-card">
      <h2>Log in</h2>
      <label>Username<input type="text" bind:value={username} autocomplete="username" /></label>
      <label>Password<input type="password" bind:value={password} autocomplete="current-password" /></label>
      {#if error}<div class="error">{error}</div>{/if}
      <button disabled={busy} on:click={submit}>{busy ? "Logging in…" : "Log in"}</button>
      <p><a href="/">← Back to dashboard</a></p>
    </div>
  {/if}
</main>
