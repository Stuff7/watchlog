<script lang="ts">
  import { saveDB, query } from "./db.ts";
  import Dialog from "./Dialog.svelte";
  import { local, connect } from "./storage.svelte.ts";
  import Input from "./Input.svelte";
  import AuthGuide from "./AuthGuide.svelte";
  import Collapsible from "./Collapsible.svelte";

  type Props = {
    open: boolean;
  };
  let { open = $bindable() }: Props = $props();

  let rows = $state<Record<string, unknown>[]>([]);
  let status = $state("idle");
  let is_editing_creds = $state(false);

  let q = $state("");
  async function run() {
    status = "running";
    rows = await query(q);
    status = "done";
    await saveDB(local.dropbox_app_name);
  }
</script>

<Dialog bind:open>
  <div class="rounded-sm p-10 bg-neutral-900 flex flex-col gap-5 w-200">
    {#snippet credsForm()}
      <AuthGuide />

      <Input
        placeholder="Dropbox client ID"
        bind:value={local.dropbox_client_id}
      />
      <Input
        placeholder="Dropbox client secret"
        bind:value={local.dropbox_client_secret}
      />
      <Input
        placeholder="Dropbox refresh token"
        bind:value={local.dropbox_refresh_token}
      />
      <Input
        placeholder="Dropbox app name"
        bind:value={local.dropbox_app_name}
      />
      <Input placeholder="TMDB Key" bind:value={local.tmdb_key} />

      <label
        class="flex items-center justify-between group cursor-pointer bg-white/5 p-4 rounded border border-white/5 hover:border-white/10 transition-colors"
      >
        <div class="flex flex-col gap-0.5">
          <span
            class="text-xs font-bold text-zinc-200 uppercase tracking-wider"
          >
            Autoconnect
          </span>
          <span class="text-[10px] text-zinc-500">
            Initialize database automatically on page load
          </span>
        </div>

        <input
          type="checkbox"
          bind:checked={local.autoconnect}
          class="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900 transition-all cursor-pointer"
        />
      </label>

      <button class="button w-full" onclick={connect}>
        {local.db_connected ? "Reconnect" : "Connect"}
      </button>

      {#if local.error}
        <p class="text-xs leading-relaxed text-red-500">
          {local.error}
        </p>
      {/if}
    {/snippet}
    {#if !local.db_connected}
      <h1
        class="font-sans text-3xl font-extrabold tracking-tighter text-white leading-none"
      >
        Credentials
      </h1>
      {@render credsForm()}
    {:else}
      <h1
        class="font-sans text-3xl font-extrabold tracking-tighter text-white leading-none"
      >
        SQLite <span class="text-amber-400">test</span>
      </h1>
      <p class="text-xs text-neutral-500 leading-relaxed">
        Fires a query into an in-memory SQLite DB running in a Web Worker.
      </p>

      <Input type="text" bind:value={q} placeholder="Query" />

      <button class="button" onclick={run} disabled={status === "running"}>
        {status === "running" ? "querying…" : "run query"}
      </button>

      {#if rows.length > 0}
        <div class="border-t border-neutral-800 pt-5 flex flex-col gap-3">
          <div
            class="text-sm text-amber-400 tracking-widest uppercase font-bold"
          >
            → {rows.length} row{rows.length !== 1 ? "s" : ""} returned
          </div>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-xs">
              <thead>
                <tr class="border-b border-neutral-800">
                  {#each Object.keys(rows[0]) as col}
                    <th
                      class="text-left text-neutral-600 p-2 font-normal uppercase tracking-widest text-xs"
                    >
                      {col}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as row}
                  <tr
                    class="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/50 transition-colors"
                  >
                    {#each Object.values(row) as val}
                      <td class="p-2 text-neutral-400">{val}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
      <Collapsible
        open={is_editing_creds}
        onclick={() => (is_editing_creds = !is_editing_creds)}
      >
        {#snippet label()}Edit credentials{/snippet}
        <div class="flex flex-col gap-5">
          {@render credsForm()}
        </div>
      </Collapsible>
    {/if}
  </div>
</Dialog>
