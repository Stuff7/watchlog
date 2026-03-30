<script lang="ts">
  import type { Media, Profile } from "$/types.d.ts";
  import type { RefreshStatus } from "./media-utils.ts";
  import DnD from "$/DnD/Root.svelte";
  import DnDNative from "$/DnDNative.svelte";
  import Dialog from "$/Dialog.svelte";
  import { getPath, setPath } from "$/App.svelte";
  import SortBar from "./SortBar.svelte";
  import MediaCardGrid from "./MediaCardGrid.svelte";
  import MediaCardList from "./MediaCardList.svelte";
  import Filters from "$/Filters/Root.svelte";
  import RefreshSummary from "./RefreshSummary.svelte";
  import { diffMedia } from "./media-utils.ts";
  import type { DiffEntry } from "./media-utils.ts";
  import { fetchTV, fetchMovie } from "$/tmdb.ts";
  import * as api from "$/api.svelte.ts";

  type RefreshResult = {
    media: Media;
    status: RefreshStatus;
    diff: DiffEntry[];
  };

  type Props = { selected_profile?: Profile; is_grid: boolean };
  let { selected_profile, is_grid }: Props = $props();

  const profile_id = $derived(getPath().split("/").filter(Boolean)[0] ?? "");
  const detailHref = (media: Media) =>
    profile_id ? `/${profile_id}/media/${media.tmdb_id}` : null;

  let filter = $state<((item: Media) => boolean) | undefined>(undefined);
  let pending_remove = $state<{ profile: Profile; media: Media } | null>(null);

  // -- Selection -------------------------------------------------------------
  let selected_ids = $state(new Set<string>());
  const selection_mode = $derived(selected_ids.size > 0);

  function toggleSelect(id: string) {
    const next = new Set(selected_ids);
    next.has(id) ? next.delete(id) : next.add(id);
    selected_ids = next;
  }

  function selectAll() {
    if (!selected_profile) return;
    const all = selected_profile.list.map((m) => m.id);
    selected_ids = selected_ids.size === all.length ? new Set() : new Set(all);
  }

  // -- Refresh ---------------------------------------------------------------
  let refresh_state = $state(new Map<string, RefreshStatus>());
  let refresh_results = $state<RefreshResult[]>([]);
  let refresh_running = $state(false);
  let show_summary = $state(false);

  async function runRefresh() {
    if (!selected_profile || refresh_running) return;
    const items = selected_profile.list.filter((m) => selected_ids.has(m.id));
    if (!items.length) return;

    refresh_running = true;
    refresh_results = [];
    show_summary = false;

    const state = new Map<string, RefreshStatus>(
      items.map((m) => [m.id, "pending"]),
    );
    refresh_state = state;

    for (const item of items) {
      state.set(item.id, "updating");
      refresh_state = new Map(state);

      try {
        const fresh =
          item.media_type === "tv"
            ? await fetchTV(item.tmdb_id)
            : await fetchMovie(item.tmdb_id);
        fresh.id = item.id;
        fresh.watched = item.watched;

        const diff = diffMedia(item, fresh);
        const status: RefreshStatus = diff.length > 0 ? "changed" : "unchanged";

        await api.refreshMedia(item.id, fresh);

        Object.assign(item, fresh);
        state.set(item.id, status);
        refresh_results.push({ media: item, status, diff });
      } catch {
        state.set(item.id, "error");
        refresh_results.push({ media: item, status: "error", diff: [] });
      }

      refresh_state = new Map(state);
      await new Promise((r) => setTimeout(r, 300));
    }

    refresh_running = false;
    show_summary = true;
    selected_ids = new Set();
  }

  function dismissSummary() {
    show_summary = false;
    refresh_state = new Map();
    refresh_results = [];
  }

  // -- Reorder / Remove ------------------------------------------------------
  function reorder() {
    if (!selected_profile) return;
    api.reorderMedia(
      selected_profile.id,
      selected_profile.list.map((m) => m.id),
    );
  }

  function confirmRemove(profile: Profile, media: Media) {
    pending_remove = { profile, media };
  }

  function doRemove() {
    if (!pending_remove) return;
    const { profile, media } = pending_remove;
    pending_remove = null;
    const idx = profile.list.findIndex((m) => m.id === media.id);
    if (idx !== -1) profile.list.splice(idx, 1);
    api.removeMedia(profile.id, media.id);
  }
</script>

<div class="sl-list-wrap">
  {#if selected_profile}
    <SortBar
      bind:list={selected_profile.list}
      {selection_mode}
      selected_count={selected_ids.size}
      {refresh_running}
      onRefresh={runRefresh}
      onSelectAll={selectAll}
    />
    <Filters bind:filter items={selected_profile.list} />

    {#if is_grid}
      <div class="sl-grid-scroll">
        <div class="sl-grid-inner" ondblclick={selectAll} role="presentation">
          <DnDNative
            bind:items={selected_profile.list}
            item_class="sl-card-wrap"
            {filter}
            onDrop={reorder}
          >
            {#snippet item_content(media: Media, i: number)}
              <MediaCardGrid
                {media}
                index={i}
                href={selection_mode ? null : detailHref(media)}
                onRemove={() => confirmRemove(selected_profile!, media)}
                selected={selected_ids.has(media.id)}
                refresh_status={refresh_state.get(media.id) ?? "idle"}
                onSelect={() => toggleSelect(media.id)}
              />
            {/snippet}
          </DnDNative>
        </div>
      </div>
    {:else}
      <div class="sl-list-header" ondblclick={selectAll} role="presentation">
        {#each ["", "Title", "Rating", "Status", "Episodes", "Network"] as col}
          <span>{col}</span>
        {/each}
      </div>
      <DnD
        bind:items={selected_profile.list}
        {filter}
        direction="vertical"
        item_class="sl-list-row"
        unlock_cross_axis
        onDrop={reorder}
      >
        {#snippet item_content(media: Media)}
          <MediaCardList
            {media}
            href={selection_mode ? null : detailHref(media)}
            onRemove={() => confirmRemove(selected_profile!, media)}
            selected={selected_ids.has(media.id)}
            onSelect={() => toggleSelect(media.id)}
          />
        {/snippet}
      </DnD>
    {/if}
  {:else}
    <div class="sl-empty">
      <div class="sl-empty-rule"></div>
      <span>No profile selected</span>
      <div class="sl-empty-rule"></div>
    </div>
  {/if}

  {#if show_summary}
    <RefreshSummary
      results={refresh_results}
      onDismiss={dismissSummary}
      onNavigate={(id) => setPath(`/${profile_id}/media/${id}`)}
    />
  {/if}
</div>

<Dialog open={!!pending_remove} onClose={() => (pending_remove = null)}>
  {#snippet header()}Remove {pending_remove?.media.name}{/snippet}
  <div class="flex flex-wrap gap-2">
    <p class="basis-full">
      Remove <strong>{pending_remove?.media.name}</strong> from this list?
    </p>
    <button class="grow" onclick={doRemove}>Remove</button>
    <button class="grow" onclick={() => (pending_remove = null)}>Cancel</button>
  </div>
</Dialog>

<style lang="postcss">
  .sl-list-wrap {
    @apply flex-1 flex flex-col overflow-hidden relative m-4 border border-white/[0.07] bg-zinc-950/60;
    backdrop-filter: blur(12px);

    &::before {
      @apply absolute inset-x-0 top-0 pointer-events-none h-px;
      content: "";
      background: var(--grad-amber-rule);
    }

    .sl-list-header,
    :global(.sl-list-row) {
      display: grid;
      grid-template-columns: 4.5rem 1fr 7rem 9rem 16rem 8rem;
    }

    .sl-list-header {
      @apply border-b border-white/[0.07] shrink-0 cursor-pointer;
      span {
        @apply font-mono uppercase text-white/25 text-xs px-3 py-2.5 tracking-[0.15em];
      }
    }

    :global(.sl-list-row) {
      @apply border-b border-white/5 cursor-pointer relative;

      &::before {
        @apply absolute left-0 top-0 bottom-0 w-0.5 bg-amber-400;
        content: "";
        transform: scaleY(0);
        transform-origin: bottom;
        transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      }

      &:hover {
        @apply bg-white/5;
        &::before {
          transform: scaleY(1);
        }
      }
    }
  }

  .sl-grid-scroll {
    @apply flex-1 overflow-y-auto min-h-0;
  }

  .sl-grid-inner {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    grid-auto-rows: auto;
    gap: 1px;
    align-items: start;
    align-content: start;

    :global(.sl-card-wrap) {
      @apply overflow-hidden bg-zinc-950 transition-colors duration-200 relative cursor-pointer;

      &::after {
        @apply absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-200;
        content: "";
        box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45);
      }

      &:hover {
        @apply z-10 bg-zinc-900;
        &::after {
          @apply opacity-100;
        }
      }
    }
  }

  .sl-empty {
    @apply flex-1 flex flex-col items-center justify-center gap-4 p-16
           font-mono uppercase text-white/20 text-xs tracking-[0.2em];

    .sl-empty-rule {
      @apply w-12 h-px;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.15),
        transparent
      );
    }
  }
</style>
