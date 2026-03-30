<script lang="ts">
  import { local } from "./storage.svelte.ts";
  import Input from "./Input.svelte";
  import AuthGuide from "./AuthGuide.svelte";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();
</script>

<Dialog bind:open>
  {#snippet header()}
    <h1
      class="font-sans text-xl font-black tracking-tighter text-white uppercase"
    >
      Settings
    </h1>
  {/snippet}

  <fieldset class="p-5 bg-neutral-900 grid gap-2 min-w-[70vw] border-none">
    <label
      class="flex items-center justify-between bg-white/5 p-4 rounded border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
    >
      <div class="flex flex-col gap-0.5">
        <span class="text-xs font-bold text-zinc-200 uppercase tracking-wider"
          >Autoconnect</span
        >
        <span class="text-[10px] text-zinc-500"
          >Initialize database automatically on page load</span
        >
      </div>
      <input
        type="checkbox"
        bind:checked={local.autoconnect}
        class="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-amber-500"
      />
    </label>

    <label
      class="flex items-center justify-between bg-white/5 p-4 rounded-t border border-white/5 cursor-pointer"
    >
      <div class="flex flex-col gap-0.5">
        <span class="text-xs font-bold text-zinc-200 uppercase tracking-wider"
          >Autosave</span
        >
        <span class="text-[10px] text-zinc-500"
          >Periodically sync changes to the cloud</span
        >
      </div>
      <input
        type="checkbox"
        bind:checked={local.autosave}
        class="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-amber-500"
      />
    </label>

    {#if local.autosave}
      <div
        class="flex items-center justify-between p-4 bg-white/5 rounded-b border-x border-b border-white/5 -mt-2"
      >
        <span
          class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest"
          >Delay (ms)</span
        >
        <div class="w-32">
          <Input type="number" bind:value={local.autosave_delay_ms} />
        </div>
      </div>
    {/if}

    <div
      class="bg-white/5 p-4 rounded border border-white/5 flex flex-col gap-3"
    >
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
      <AuthGuide />
    </div>
  </fieldset>
</Dialog>
