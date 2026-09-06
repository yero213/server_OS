<script>
import { onMount } from "svelte";
import { getMe, postLogout } from "$lib/auth";

let health = null;
let sysinfo = null;
let disks = null;
let me = null;
let error = "";
let loading = true;

function fmtBytes(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(v) / Math.log(1024)));
  return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

onMount(async () => {
  try {
    const [h, s] = await Promise.all([
      fetch("/api/v1/health").then((r) => {
        if (!r.ok) throw new Error("health HTTP " + r.status);
        return r.json();
      }),
      fetch("/api/v1/system/info").then((r) => (r.ok ? r.json() : null)),
    ]);
    health = h;
    sysinfo = s;
    getMe()
      .then((m) => {
        me = m.authenticated ? m.user : null;
      })
      .catch(() => {
        me = null;
      });
    if (h?.storage?.supported) {
      disks = await fetch("/api/v1/storage/disks")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
  } catch (e) {
    error = "API unreachable: " + (e?.message ?? e) + ". Is serveros-api running behind Caddy?";
  } finally {
    loading = false;
  }
});

async function logout() {
  await postLogout();
  me = null;
}
</script>

<main>
  <header class="top">
    <div class="logo">▦</div>
    <div>
      <h1>Server OS</h1>
      <div class="sub">Home-server control center <span class="badge">Phase 1 / Bootstrap</span></div>
    </div>
    <div class="session">
      {#if me}
        <span class="badge ok">✓ {me.username} ({me.role})</span>
        <button class="linkbtn" on:click={logout}>Log out</button>
      {:else}
        <span class="badge">guest</span>
        <a href="/login">Log in</a>
      {/if}
    </div>
  </header>

  {#if loading}
    <div class="card"><div class="big">Loading…</div><div class="sub">Contacting <code>/api/v1/health</code></div></div>
  {:else if error}
    <div class="error">{error}</div>
    <div class="card">
      <h2>API status</h2>
      <div class="big bad"><span class="dot bad"></span>Offline</div>
    </div>
  {:else}
    <div class="grid">
      <div class="card">
        <h2>API status</h2>
        <div class="big ok"><span class="dot ok"></span>Online</div>
        <div class="row"><span>Version</span><span>{health.version} ({health.phase})</span></div>
        <div class="row"><span>Uptime</span><span>{health.api.uptimeSec}s</span></div>
        <div class="row"><span>Database</span><span class={health.db.ok ? "ok" : "bad"}>{health.db.ok ? "OK" : "FAIL"}</span></div>
      </div>

      <div class="card">
        <h2>Docker</h2>
        {#if health.docker.available}
          <div class="big ok"><span class="dot ok"></span>Available</div>
          <div class="row"><span>Server version</span><span>{health.docker.version}</span></div>
        {:else}
          <div class="big warn"><span class="dot warn"></span>Unavailable</div>
          <div class="row"><span>Detail</span><span>{health.docker.error ?? "daemon not reachable"}</span></div>
        {/if}
        <div class="row"><span>Helper</span><span class={health.helper.available ? "ok" : "warn"}>{health.helper.available ? "connected" : "not connected"}</span></div>
      </div>

      <div class="card">
        <h2>Compute</h2>
        {#if sysinfo}
          <div class="big">{sysinfo.cpuCount} × CPU</div>
          <div class="row"><span>Model</span><span>{sysinfo.cpuModel}</span></div>
          <div class="row"><span>RAM</span><span>{fmtBytes(sysinfo.memTotalBytes - sysinfo.memFreeBytes)} / {fmtBytes(sysinfo.memTotalBytes)}</span></div>
          <div class="row"><span>Load (1m)</span><span>{sysinfo.loadAvg1}</span></div>
        {:else}
          <div class="big warn">No data</div>
        {/if}
      </div>

      <div class="card">
        <h2>Storage (read-only)</h2>
        {#if !health.storage.supported}
          <div class="big warn"><span class="dot warn"></span>Discovery off-Linux</div>
          <div class="row"><span>Reason</span><span>{health.storage.reason}</span></div>
        {:else if disks?.devices?.length}
          <div class="big">{disks.devices.length} device(s)</div>
          {#each disks.devices.slice(0, 6) as d}
            <div class="row"><span>{d.path ?? d.name}</span><span>{fmtBytes(d.size)}</span></div>
          {/each}
        {:else}
          <div class="big warn">No devices reported</div>
        {/if}
        <div class="row"><span>Destructive ops</span><span class="ok">disabled (501)</span></div>
      </div>
    </div>
  {/if}

  <footer>
    Phase 1 bootstrap — read-only monitoring. No App Store, no Immich, no storage mutations.
    API contract: <code>GET /api/v1/health</code>
  </footer>
</main>
