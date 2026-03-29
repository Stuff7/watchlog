<script lang="ts">
  import { local, disconnect } from "./storage.svelte.ts";
  import Setup from "./Setup.svelte";

  let is_setup_open = $state(false);

  let status = $derived.by(() => {
    if (local.error) return "error";
    if (local.db_connected) return "connected";
    return "disconnected";
  });

  const status_colors = {
    connected: "text-lime-400 drop-shadow-[0_0_8px_rgba(163,230,53,0.3)]",
    disconnected: "text-white/20",
    error: "text-red-500 animate-pulse",
  };
</script>

<div class="flex items-center gap-3">
  <button
    class="button icon bordered relative {status_colors[status]}"
    onclick={() => (is_setup_open = true)}
    class:connected={local.db_connected}
    aria-label="Database Settings"
    title={local.db_connected
      ? `Connected to ${local.dropbox_app_name}`
      : "Connect Database"}
  >
    
    {#if local.db_connected}
      <span
        class="absolute -top-1 -right-1 w-2 h-2 bg-lime-500 rounded-full border border-zinc-950"
      ></span>
    {/if}
  </button>

  {#if local.db_connected}
    <button
      onclick={disconnect}
      class="button text-xs font-mono uppercase tracking-widest text-white/30 hover:text-red-400 transition-colors"
    >
      Disconnect
    </button>
  {/if}
</div>

<Setup bind:open={is_setup_open} />

<style lang="postcss">
  .connected {
    @apply border-lime-500/20 bg-lime-500/5;
  }
  .connected:hover {
    @apply border-lime-500/40 bg-lime-500/10;
  }
</style>
