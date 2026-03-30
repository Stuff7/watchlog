<script lang="ts">
  import { saveDB, query } from "./db.ts";
  import Dialog from "./Dialog.svelte";
  import { local, connect, disconnect } from "./storage.svelte.ts";
  import Input from "./Input.svelte";
  import Settings from "./Settings.svelte";

  type Props = { open: boolean };
  let { open = $bindable() }: Props = $props();

  let rows = $state<Record<string, unknown>[]>([]);
  let status = $state("idle");
  let q = $state("");
  let editing_creds = $state(false);

  async function runQuery() {
    status = "running";
    rows = await query(q);
    status = "done";
    await saveDB();
  }
</script>

<Dialog bind:open>
  {#snippet header()}
    <div class="flex items-center gap-4 py-1 min-w-[50vw]">
      <div class="flex flex-col">
        <h1
          class="font-sans text-xl font-black tracking-tighter text-white uppercase"
        >
          SQLite <span class="text-amber-400">Explorer</span>
        </h1>
        {#if local.db_connected}
          <span
            class="text-[9px] font-mono text-lime-500 uppercase tracking-widest"
          >
            ● Active: {local.dropbox_app_name}
          </span>
        {/if}
      </div>

      <div class="flex gap-2 ml-auto">
        {#if local.db_connected}
          <button onclick={disconnect} class="button compact danger bordered">
            Disconnect
          </button>
        {/if}
        <button class="button icon" onclick={() => (editing_creds = true)}>
          
        </button>
      </div>
    </div>
  {/snippet}

  <div class="flex flex-col gap-6 p-6">
    {#if !local.db_connected}
      <div
        class="flex flex-col items-center py-16 px-8 bg-black/20 border border-neutral-800/50 rounded-lg relative overflow-hidden"
      >
        <div
          class="icon absolute -top-10 -right-10 text-9xl text-white/[0.02] pointer-events-none select-none"
        >
          
        </div>

        <div
          class="flex flex-col items-center text-center max-w-sm gap-6 relative z-10"
        >
          <div
            class="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-2xl text-neutral-600 mb-2"
          >
            <i></i>
          </div>

          <div class="flex flex-col gap-2">
            <h2 class="text-white font-bold tracking-tight text-lg">
              Storage Offline
            </h2>
            <p class="text-sm text-neutral-500 leading-relaxed">
              To browse your <span class="text-neutral-300 font-mono"
                >.sqlite</span
              > data, you need to sync with your remote storage provider.
            </p>
          </div>

          <button
            class="button large success shadow-xl shadow-emerald-900/10"
            onclick={connect}
          >
            Connect to Dropbox
          </button>

          {#if local.error}
            <div class="mt-4 flex flex-col gap-1 w-full">
              <span
                class="text-[10px] text-red-500/80 font-mono uppercase tracking-widest text-left"
                >Connection Failure</span
              >
              <p
                class="text-xs text-red-400 font-mono bg-red-950/30 px-3 py-2 border border-red-900/40 rounded-sm text-left"
              >
                {local.error}
              </p>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        <div class="flex gap-2">
          <div class="flex-1">
            <Input
              type="text"
              bind:value={q}
              placeholder="SELECT * FROM media LIMIT 10"
            />
          </div>
          <button
            class="button px-6"
            onclick={runQuery}
            disabled={status === "running" || !q.trim()}
          >
            {status === "running" ? "..." : "Execute"}
          </button>
        </div>
      </div>

      {#if rows.length > 0}
        <div class="flex flex-col gap-2">
          <div
            class="text-[10px] text-amber-500/80 tracking-[0.2em] font-bold uppercase"
          >
            {rows.length} record{rows.length !== 1 ? "s" : ""} found
          </div>
          <div
            class="overflow-auto max-h-[400px] border border-neutral-800 bg-black/20"
          >
            <table class="w-full border-collapse text-[11px] font-mono">
              <thead
                class="sticky top-0 bg-neutral-900 shadow-[0_1px_0_rgba(255,255,255,0.05)]"
              >
                <tr>
                  {#each Object.keys(rows[0]) as col}
                    <th
                      class="text-left text-neutral-500 p-3 font-medium uppercase tracking-wider"
                      >{col}</th
                    >
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as row}
                  <tr
                    class="border-b border-neutral-800/40 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    {#each Object.values(row) as val}
                      <td class="p-3 text-neutral-300 truncate max-w-[200px]"
                        >{val}</td
                      >
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</Dialog>

<Settings bind:open={editing_creds} />

<style lang="postcss">
  /* Targeted table refinement */
  table {
    @apply border-spacing-0;
  }

  th {
    @apply border-b border-neutral-800;
  }
</style>
