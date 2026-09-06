<script>
import { onMount } from "svelte";
import { getMe, postLogout } from "$lib/auth";

let health = null;
let sysinfo = null;
let disks = null;
let me = null;
let error = "";
let loading = true;
let theme = "light";

function fmtBytes(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(v) / Math.log(1024)));
  return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function fmtUptime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}

function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("serveros-theme", t);
  } catch {
    /* private mode etc. — theme just won't persist */
  }
}

onMount(async () => {
  try {
    theme = localStorage.getItem("serveros-theme") || "light";
  } catch {
    theme = "light";
  }
  document.documentElement.dataset.theme = theme;
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

<div class="shell" id="top">
  <aside class="side">
    <div class="nav-title">Monitor</div>
    <a class="nav active" href="#top"><span class="glyph">▦</span>Dashboard</a>
    <a class="nav" href="#system"><span class="glyph">⚙</span>System</a>
    <a class="nav" href="#storage"><span class="glyph">🖴</span>Storage</a>
    <a class="nav" href="#docker"><span class="glyph">🐳</span>Docker</a>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">📜</span>Logs</a>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">🔧</span>Settings</a>
    <div class="nav-title">Later phases</div>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">📦</span>Apps<span class="soon">soon</span></a>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">🏪</span>App Store<span class="soon">soon</span></a>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">🖧</span>Data Nodes<span class="soon">soon</span></a>
    <a class="nav disabled" href="#top" on:click|preventDefault={() => {}}><span class="glyph">👥</span>Users<span class="soon">soon</span></a>
  </aside>

  <div class="content">
    <header class="topbar">
      <div class="logo">▦</div>
      <div>
        <h1>Server OS</h1>
        <div class="sub">Home-server control center <span class="badge">Phase 1 / Bootstrap</span></div>
      </div>
      <div class="topbar-right">
        <button class="themebtn" title="Toggle light/dark" on:click={() => applyTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? "☾" : "☀"}
        </button>
        <div class="session">
          {#if me}
            <span class="badge ok">✓ {me.username} ({me.role})</span>
            <button class="linkbtn" on:click={logout}>Log out</button>
          {:else}
            <span class="badge dim">guest</span>
            <a href="/login">Log in</a>
          {/if}
        </div>
      </div>
    </header>

    {#if loading}
      <div class="card"><div class="big">Loading…</div><div class="sub">Contacting <code>/api/v1/health</code></div></div>
      <!-- Skeleton shells carry the anchor ids so prerendered HTML
           already contains every sidebar target. -->
      <div class="grid" aria-hidden="true">
        <div class="card" id="api"><h2><span class="chip purple">⇄</span>API status</h2><div class="big">…</div></div>
        <div class="card" id="docker"><h2><span class="chip blue">🐳</span>Docker</h2><div class="big">…</div></div>
        <div class="card" id="system"><h2><span class="chip pink">⚙</span>Compute</h2><div class="big">…</div></div>
        <div class="card" id="storage"><h2><span class="chip green">🖴</span>Storage (read-only)</h2><div class="big">…</div></div>
      </div>
    {:else if error}
      <div class="error">{error}</div>
      <div class="card">
        <h2><span class="chip pink">●</span>API status</h2>
        <div class="hero"><div class="big bad">Offline</div><span class="pill bad">Unreachable</span></div>
      </div>
    {:else}
      <div class="grid">
        <div class="card" id="api">
          <h2><span class="chip purple">⇄</span>API status</h2>
          <div class="hero"><div class="big ok">Online</div><span class="pill ok">● Healthy</span></div>
          <div class="row"><span>Version</span><span>{health.version} ({health.phase})</span></div>
          <div class="row"><span>Uptime</span><span>{fmtUptime(health.api.uptimeSec)}</span></div>
          <div class="row"><span>Database</span><span class={health.db.ok ? "ok" : "bad"}>{health.db.ok ? "OK" : "FAIL"}</span></div>
        </div>

        <div class="card" id="docker">
          <h2><span class="chip blue">🐳</span>Docker</h2>
          {#if health.docker.available}
            <div class="hero"><div class="big ok">Available</div><span class="pill ok">● Healthy</span></div>
            <div class="row"><span>Server version</span><span>{health.docker.version}</span></div>
          {:else}
            <div class="hero"><div class="big warn">Unavailable</div><span class="pill warn">● Degraded</span></div>
            <div class="row"><span>Detail</span><span>{health.docker.error ?? "daemon not reachable"}</span></div>
          {/if}
          <div class="row"><span>Helper</span><span class={health.helper.available ? "ok" : "warn"}>{health.helper.available ? "connected" : "not connected"}</span></div>
        </div>

        <div class="card" id="system">
          <h2><span class="chip pink">⚙</span>Compute</h2>
          {#if sysinfo}
            <div class="hero">
              <div class="big">{sysinfo.cpuCount} × CPU</div>
              {#if sysinfo.loadAvg1 < sysinfo.cpuCount}
                <span class="pill ok">● Load nominal</span>
              {:else}
                <span class="pill warn">● Load high</span>
              {/if}
            </div>
            <div class="row"><span>Model</span><span>{sysinfo.cpuModel}</span></div>
            <div class="row"><span>RAM</span><span>{fmtBytes(sysinfo.memTotalBytes - sysinfo.memFreeBytes)} / {fmtBytes(sysinfo.memTotalBytes)}</span></div>
            <div class="row"><span>Load (1m)</span><span>{sysinfo.loadAvg1}</span></div>
          {:else}
            <div class="hero"><div class="big warn">No data</div><span class="pill warn">● Unknown</span></div>
          {/if}
        </div>

        <div class="card" id="storage">
          <h2><span class="chip green">🖴</span>Storage (read-only)</h2>
          {#if !health.storage.supported}
            <div class="hero"><div class="big warn">Discovery off-Linux</div><span class="pill warn">● Degraded</span></div>
            <div class="row"><span>Reason</span><span>{health.storage.reason}</span></div>
          {:else if disks?.devices?.length}
            <div class="hero"><div class="big">{disks.devices.length} device(s)</div><span class="pill info">● Read-only</span></div>
            {#each disks.devices.slice(0, 6) as d}
              <div class="row"><span>{d.path ?? d.name}</span><span>{fmtBytes(d.size)}</span></div>
            {/each}
          {:else}
            <div class="hero"><div class="big warn">No devices reported</div><span class="pill warn">● Unknown</span></div>
          {/if}
          <div class="row"><span>Destructive ops</span><span class="ok">disabled (501)</span></div>
        </div>
      </div>
    {/if}

    <footer>
      Phase 1 bootstrap — read-only monitoring. No App Store, no Immich, no storage mutations.
      API contract: <code>GET /api/v1/health</code>
    </footer>
  </div>
</div>
