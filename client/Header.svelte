<script lang="ts">
  import type { Media, Profile } from "$/types.d.ts";
  import { fetchTV, fetchMovie, search } from "$/tmdb.ts";
  import { persistMedia } from "$/App.svelte";
  import ImportDialog from "$/ImportDialog.svelte";
  import Settings from "./Settings.svelte";
  import Credentials from "./Credentials.svelte";

  type Props = {
    profile?: Profile;
    is_grid: boolean;
    onError: (msg: string) => void;
  };
  let { profile, is_grid = $bindable(), onError }: Props = $props();

  let query = $state("");
  let results = $state<Media[]>([]);
  let searching = $state(false);
  let search_error = $state<string | null>(null);
  let debounce_timer: ReturnType<typeof setTimeout>;

  function onQueryInput() {
    clearTimeout(debounce_timer);
    results = [];
    search_error = null;
    if (!query.trim()) return;
    debounce_timer = setTimeout(runSearch, 350);
  }

  async function runSearch() {
    searching = true;
    try {
      results = await search(query);
    } catch (e: any) {
      search_error = e.message;
    } finally {
      searching = false;
    }
  }

  let adding = $state<number | null>(null);

  async function addMedia(item: Media) {
    if (!profile || adding !== null) return;
    adding = item.tmdb_id;
    try {
      const full =
        item.media_type === "tv"
          ? await fetchTV(item.tmdb_id)
          : await fetchMovie(item.tmdb_id);
      const err = await persistMedia(profile, full);
      if (err) {
        onError(err);
      } else {
        query = "";
        results = [];
      }
    } catch (e: any) {
      search_error = e.message;
    } finally {
      adding = null;
    }
  }

  function closeSearch() {
    query = "";
    results = [];
    search_error = null;
  }

  let import_open = $state(false);
  let settings_open = $state(false);
</script>

<header class="sl-header">
  <div class="sl-header-inner">
    <a href="/" class="sl-wordmark" aria-label="WatchLog home"
      ><i></i> WatchLog
    </a>
    <Settings bind:open={settings_open} />

    <div class="sl-divider"></div>

    <!-- Search -->
    <div class="sl-search">
      <div class="sl-search-field">
        <i class="sl-search-icon"></i>
        <input
          type="text"
          placeholder="Search films & series…"
          bind:value={query}
          oninput={onQueryInput}
          class="sl-search-input plain"
          autocomplete="off"
          spellcheck="false"
        />
        {#if searching}
          <span class="sl-search-spinner"></span>
        {:else if query}
          <button
            onclick={closeSearch}
            class="sl-search-clear plain no-color"
            aria-label="Clear">✕</button
          >
        {/if}
      </div>

      {#if results.length || search_error}
        <div class="sl-dropdown">
          {#if search_error}
            <p class="sl-dropdown-error">{search_error}</p>
          {/if}
          {#each results as item}
            <button
              class="sl-result plain no-color"
              onclick={() => addMedia(item)}
              disabled={adding === item.tmdb_id || !profile}
            >
              <div class="sl-result-thumb">
                {#if item.poster}
                  <img src={item.poster} alt="" loading="lazy" />
                {/if}
              </div>
              <div class="sl-result-info">
                <span class="sl-result-title">{item.name}</span>
                <div class="sl-result-meta">
                  <span
                    class="sl-result-type"
                    class:film={item.media_type === "movie"}
                  >
                    {item.media_type === "movie" ? "Film" : "Series"}
                  </span>
                  {#if item.premiered}
                    <span class="sl-result-year"
                      >{item.premiered.slice(0, 4)}</span
                    >
                  {/if}
                  {#if item.rating}
                    <span class="sl-result-rating"
                      >★ {item.rating.toFixed(1)}</span
                    >
                  {/if}
                </div>
              </div>
              <span class="sl-result-action">
                {#if adding === item.tmdb_id}
                  <span class="sl-adding">…</span>
                {:else if !profile}
                  <span class="sl-no-profile">No list</span>
                {:else}
                  <span class="sl-add-hint">＋</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class="button icon bordered"
      onclick={() => (import_open = true)}
      disabled={!profile}
      aria-label="Import from JSON"
      title="Import from JSON"
    >
      
    </button>

    <button
      class="button icon bordered"
      onclick={() => (settings_open = true)}
      aria-label="Settings"
    >
      
    </button>

    <Credentials />
    <div class="sl-spacer"></div>

    <!-- View toggle -->
    <div class="sl-toggle">
      <span class="sl-toggle-label" class:active={!is_grid}>List</span>
      <span class="sl-toggle-label" class:active={is_grid}>Grid</span>
      <span class="sl-toggle-pill" class:right={is_grid}></span>
      <input
        type="checkbox"
        class="sl-toggle-input plain"
        bind:checked={is_grid}
        aria-label="Toggle grid view"
      />
    </div>
  </div>
</header>

<ImportDialog
  open={import_open}
  {profile}
  onClose={() => (import_open = false)}
  {onError}
/>

<style lang="postcss">
  .sl-header {
    @apply relative z-40 border-b border-white/[0.06] bg-zinc-950/85;
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.03),
      0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .sl-header-inner {
    @apply flex items-center gap-2 relative px-5 h-14;
  }
  .sl-wordmark {
    @apply flex items-center gap-2 no-underline shrink-0;
  }
  :global(.sl-wordmark-icon) {
    @apply text-base text-amber-400 icon;
    filter: drop-shadow(0 0 6px rgb(245 158 11 / 0.5));
  }
  :global(.sl-wordmark-text) {
    @apply text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100;
  }
  .sl-divider {
    @apply w-px h-4 bg-white/[0.08] shrink-0;
  }
  .sl-spacer {
    @apply grow-1;
  }

  .sl-search {
    @apply relative flex-1 max-w-sm;
  }
  .sl-search-field {
    @apply flex items-center gap-4 border border-white/[0.08] px-3 h-8
         transition-colors duration-150 bg-white/5;
  }
  .sl-search-field:focus-within {
    @apply border-amber-500/40 bg-white/[0.06];
  }
  .sl-search-icon {
    @apply shrink-0 text-white/30 w-3 h-3;
  }
  .sl-search-input {
    @apply flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 font-[inherit] placeholder:text-white/25;
  }
  .sl-search-spinner {
    border: 1.5px solid rgb(245 158 11 / 0.2);
    @apply rounded-full shrink-0 w-3 h-3 border-t-amber-400;
    animation: sl-spin 0.7s linear infinite;
  }
  .sl-search-clear {
    @apply text-white/30 text-xs leading-none cursor-pointer transition-colors duration-100 bg-transparent border-none p-0;
  }
  .sl-search-clear:hover {
    @apply text-white/70;
  }

  .sl-dropdown {
    @apply absolute left-0 right-0 border border-white/10 overflow-hidden overflow-y-auto max-h-96 bg-zinc-900;
    top: calc(100% + 6px);
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.9),
      0 0 0 1px rgba(255, 255, 255, 0.03);
  }
  .sl-dropdown-error {
    @apply text-red-400 font-mono text-xs p-3;
  }

  .sl-result {
    @apply flex items-center gap-3 w-full border-b border-white/5 bg-transparent cursor-pointer
         text-left transition-colors duration-100 last:border-b-0
         disabled:opacity-40 disabled:cursor-not-allowed py-2.5 px-3.5;
  }
  .sl-result:hover {
    @apply bg-white/5;
  }
  .sl-result-thumb {
    @apply overflow-hidden shrink-0 bg-white/[0.06] w-8;
    height: 44px;
  }
  .sl-result-thumb img {
    @apply w-full h-full object-cover;
  }
  .sl-result-info {
    @apply flex-1 min-w-0 flex flex-col gap-0.5;
  }
  .sl-result-title {
    @apply text-sm font-medium text-zinc-100 whitespace-nowrap overflow-hidden text-ellipsis;
  }
  .sl-result-meta {
    @apply flex items-center gap-2;
  }
  .sl-result-type {
    @apply font-mono uppercase text-amber-400 text-xs tracking-[0.06em];
  }
  .sl-result-type.film {
    @apply text-sky-400;
  }
  .sl-result-year,
  .sl-result-rating {
    @apply font-mono text-white/35 text-xs;
  }
  .sl-result-action {
    @apply shrink-0;
  }
  .sl-adding {
    @apply font-mono text-amber-400 text-xs;
    animation: sl-pulse 1s infinite;
  }
  .sl-no-profile {
    @apply font-mono text-white/20 text-xs;
  }
  .sl-add-hint {
    @apply text-sm text-white/15 transition-colors duration-100;
  }
  .sl-result:hover .sl-add-hint {
    @apply text-amber-400;
  }

  .sl-toggle {
    @apply relative flex items-center shrink-0 border border-white/[0.08] overflow-hidden;
  }
  .sl-toggle-label {
    @apply relative z-[2] font-mono font-semibold uppercase pointer-events-none transition-colors duration-200 text-white/30 text-xs py-1.5 px-3 tracking-[0.1em];
  }
  .sl-toggle-label.active {
    @apply text-zinc-900;
  }
  .sl-toggle-pill {
    @apply absolute top-0 bottom-0 w-1/2 bg-amber-400;
    transform: translateX(0);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sl-toggle-pill.right {
    transform: translateX(100%);
  }
  .sl-toggle-input {
    @apply absolute inset-0 opacity-0 cursor-pointer w-full h-full z-[3] m-0 p-0 bg-transparent border-none;
  }

  @keyframes sl-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes sl-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
</style>
