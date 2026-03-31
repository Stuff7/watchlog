<script lang="ts" module>
  import type { Media, Profile } from "$/types.d.ts";
  import { generateShortId } from "$/utils.ts";
  import * as api from "$/api.svelte.ts";

  let path = $state(location.pathname);
  export const getPath = () => path;
  export const setPath = (v: string) => {
    history.pushState({}, "", v);
    path = v;
  };

  export async function persistMedia(
    profile: Profile,
    media: Media,
  ): Promise<string | null> {
    if (profile.list.some((m) => m.tmdb_id === media.tmdb_id)) return null;

    media.id = generateShortId();
    profile.list.push(media);

    try {
      const id = await api.addMedia(profile.id, media);
      media.id = id;
      return null;
    } catch {
      const idx = profile.list.findIndex((m) => m.id === media.id);
      if (idx !== -1) profile.list.splice(idx, 1);
      return `Failed to add "${media.name}" to the list.`;
    }
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Header from "$/Header.svelte";
  import Footer from "$/Footer.svelte";
  import MediaView from "$/MediaView/Root.svelte";
  import Detail from "$/Details/Root.svelte";
  import Dialog from "$/Dialog.svelte";
  import type { MediaDetails } from "$/types.d.ts";
  import {
    fetchTVDetails,
    fetchMovieDetails,
    fetchTV,
    fetchMovie,
  } from "$/tmdb.ts";
  import { initWorker, query, saveDB } from "./db";
  import { connect, local, saveLocal } from "./storage.svelte.ts";

  onMount(() => {
    initWorker().then(() => {
      if (
        local.autoconnect &&
        local.dropbox_refresh_token &&
        local.dropbox_client_id &&
        local.dropbox_client_secret &&
        local.dropbox_app_name
      )
        connect();
    });

    const sync = () => (path = location.pathname);
    window.addEventListener("popstate", sync);

    return () => window.removeEventListener("popstate", sync);
  });

  let is_grid = $state(false);
  let profiles = $state<Profile[]>([]);
  let error_message = $state<string | null>(null);

  let last_saved = -1;
  $effect(() => {
    if (!local.db_dirty) return;

    untrack(() => {
      if (!local.autosave) return;

      local.saving_db = true;
      clearTimeout(last_saved);
      last_saved = setTimeout(async () => {
        await saveDB();
        local.saving_db = false;
        local.db_dirty = false;
      }, local.autosave_delay_ms);
    });
  });

  $effect(saveLocal);

  $effect(() => {
    error_message = local.error;
  });

  $effect(() => {
    if (!local.db_reload) return;

    api.getProfiles().then((data) => {
      for (const p of data) for (const m of p.list) m.genres ??= [];
      profiles = data;
      if (!profiles.find((p) => p.id === profile_id)) {
        const first = profiles.find((p) => p.open);
        if (first) setPath(`/${first.id}`);
      }
    });
  });

  // -- Route parsing ---------------------------------------------------------
  // /{profile_id}                → list/grid view
  // /{profile_id}/media/{tmdb_id} → detail view

  const segments = $derived(path.replace(/^\//, "").split("/"));
  const profile_id = $derived(segments[0] ?? "");
  const is_detail_route = $derived(segments[1] === "media" && !!segments[2]);
  const tmdb_id = $derived(is_detail_route ? Number(segments[2]) : null);
  const selected_profile = $derived(profiles.find((p) => p.id === profile_id));

  // -- Detail fetching -------------------------------------------------------

  let details_cache = $state<Record<number, MediaDetails>>({});
  let details_loading = $state(false);
  let details_error = $state<string | null>(null);

  $effect(() => {
    if (!tmdb_id) return;
    if (details_cache[tmdb_id]) return;

    details_loading = true;
    details_error = null;

    const in_list = selected_profile?.list.find((m) => m.tmdb_id === tmdb_id);
    const fetcher = in_list
      ? in_list.media_type === "tv"
        ? fetchTVDetails
        : fetchMovieDetails
      : null;

    const load = fetcher
      ? fetcher(tmdb_id)
      : fetchTVDetails(tmdb_id).catch(() => fetchMovieDetails(tmdb_id));

    load
      .then((d) => {
        details_cache[tmdb_id] = d;
      })
      .catch((e) => {
        details_error = e.message;
      })
      .finally(() => {
        details_loading = false;
      });
  });

  const details = $derived<MediaDetails | null>(
    tmdb_id ? (details_cache[tmdb_id] ?? null) : null,
  );

  const detail_media = $derived<Media | null>(
    (tmdb_id && selected_profile?.list.find((m) => m.tmdb_id === tmdb_id)) ||
      details?.media ||
      null,
  );

  const in_list = $derived(
    !!(tmdb_id && selected_profile?.list.some((m) => m.tmdb_id === tmdb_id)),
  );

  async function addToProfile() {
    if (!selected_profile || !detail_media) return;
    const full =
      detail_media.media_type === "tv"
        ? await fetchTV(detail_media.tmdb_id)
        : await fetchMovie(detail_media.tmdb_id);
    const err = await persistMedia(selected_profile, full);
    if (err) error_message = err;
  }

  let pending_remove_detail = $state(false);

  function removeFromProfile() {
    pending_remove_detail = true;
  }

  function toggleWatched() {
    if (!selected_profile || !tmdb_id) return;
    const item = selected_profile.list.find((m) => m.tmdb_id === tmdb_id);
    if (!item) return;
    item.watched = !item.watched;
    api
      .updateMediaWatched(selected_profile.id, item.id, item.watched)
      .catch(() => {
        item.watched = !item.watched;
      });
  }

  function doRemoveFromProfile() {
    if (!selected_profile || !tmdb_id) return;
    pending_remove_detail = false;
    const item = selected_profile.list.find((m) => m.tmdb_id === tmdb_id);
    if (!item) return;
    const idx = selected_profile.list.indexOf(item);
    if (idx !== -1) selected_profile.list.splice(idx, 1);
    api.removeMedia(selected_profile.id, item.id);
  }

  const page_title = $derived(
    detail_media
      ? `${detail_media.name} – ScreenLog`
      : selected_profile
        ? `${selected_profile.name} – ScreenLog`
        : "ScreenLog",
  );
</script>

<svelte:head>
  <title>{page_title}</title>
</svelte:head>

<main
  class="sl-app"
  onpointerdown={() => {
    query("SELECT id, name, open FROM profiles ORDER BY rowid ASC").catch(
      () => (local.db_connected = false),
    );
  }}
>
  <Header
    profile={selected_profile}
    bind:is_grid
    onError={(msg) => (error_message = msg)}
  />

  {#if is_detail_route}
    {#if details_loading}
      <div class="flex flex-col items-center justify-center flex-1 gap-3">
        <span
          class="text-zinc-600 text-xs font-mono uppercase tracking-widest animate-pulse"
          >Loading…</span
        >
      </div>
    {:else if details_error}
      <div class="flex flex-col items-center justify-center flex-1 gap-3">
        <span class="text-red-500 text-sm font-mono">{details_error}</span>
        <button
          onclick={() => setPath(`/${profile_id}`)}
          class="text-xs font-mono text-amber-300 hover:text-amber-100 underline underline-offset-2"
          >← Back to list</button
        >
      </div>
    {:else if detail_media && details}
      <div
        style="flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;"
      >
        <Detail
          media={detail_media}
          {details}
          {profile_id}
          {in_list}
          onAdd={addToProfile}
          onRemove={removeFromProfile}
          onToggleWatched={toggleWatched}
          onclose={() => setPath(`/${profile_id}`)}
        />
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center flex-1 gap-3">
        <span
          class="text-zinc-600 text-xs font-mono uppercase tracking-widest animate-pulse"
          >Loading…</span
        >
      </div>
    {/if}
  {:else}
    <MediaView {selected_profile} {is_grid} />
  {/if}

  <Footer {selected_profile} bind:profiles />

  <Dialog open={!!error_message} onClose={() => (error_message = null)}>
    {#snippet header()}Something went wrong{/snippet}
    <div class="flex flex-wrap gap-2 p-2">
      <p class="basis-full text-red-400 font-mono text-sm">{error_message}</p>
      <button class="button grow" onclick={() => (error_message = null)}
        >OK</button
      >
    </div>
  </Dialog>

  <Dialog
    open={pending_remove_detail}
    onClose={() => (pending_remove_detail = false)}
  >
    {#snippet header()}Remove {detail_media?.name}{/snippet}
    <div class="flex flex-wrap gap-2">
      <p class="basis-full">
        Remove <strong>{detail_media?.name}</strong> from this list?
      </p>
      <button class="grow" onclick={doRemoveFromProfile}>Remove</button>
      <button class="grow" onclick={() => (pending_remove_detail = false)}
        >Cancel</button
      >
    </div>
  </Dialog>
</main>

<style lang="postcss">
  .sl-app {
    @apply flex flex-col text-zinc-100 bg-zinc-950;
    height: 100dvh;
    background: linear-gradient(
      to bottom right,
      #0f4840,
      #4f2f4f,
      #091111 120%
    );
  }
</style>
