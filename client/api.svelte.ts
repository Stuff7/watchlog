import type { EpisodeRef, Media, Profile, Status } from "$/types.d.ts";
import type { SqlValue } from "@sqlite.org/sqlite-wasm";
import { query } from "./db.ts";

function toMediaType(val: unknown): Media["media_type"] {
  const s = String(val);
  return s === "tv" || s === "movie" ? s : "movie";
}

function toStatus(val: unknown): Status {
  const s = String(val);
  const valid_statuses: Status[] = [
    "Released",
    "Planned",
    "In Production",
    "Ended",
    "Canceled",
    "Returning Series",
  ];

  // Check if the string from DB is one of our allowed Union members
  if ((valid_statuses as string[]).includes(s)) {
    return s as Status;
  }

  return "Released"; // Fallback safe default
}

/**
 * Loads all profiles and their associated media items via the Worker API.
 */
export async function getProfiles(): Promise<Profile[]> {
  const profile_rows = await query<{ id: string; name: string; open: number }>(
    "SELECT id, name, open FROM profiles ORDER BY rowid ASC",
  );

  return Promise.all(
    profile_rows.map(async (row) => {
      const id = row.id;
      return {
        id,
        name: row.name,
        open: row.open !== 0,
        list: await loadMediaForProfile(id),
      };
    }),
  );
}

async function loadMediaForProfile(profile_id: string): Promise<Media[]> {
  const sql = `
    SELECT
      m.id, m.tmdb_id, m.name, m.media_type, m.status,
      m.poster, m.backdrop, m.overview, m.tagline, m.language,
      m.rating, m.vote_count, m.runtime, m.premiered, m.ended,
      m.network, m.updated, m.number_of_seasons, m.number_of_episodes,
      m.release_date,
      m.last_ep_season, m.last_ep_episode, m.last_ep_name,
      m.last_ep_air_date, m.last_ep_overview, m.last_ep_runtime, m.last_ep_still,
      m.next_ep_season, m.next_ep_episode, m.next_ep_name,
      m.next_ep_air_date, m.next_ep_overview, m.next_ep_runtime, m.next_ep_still,
      COALESCE(wp.watched, 0) as watched_flag
    FROM profile_media pm
    JOIN media m ON m.id = pm.media_id
    LEFT JOIN watch_progress wp ON wp.profile_id = pm.profile_id
      AND wp.media_id = m.id
      AND wp.deleted_at IS NULL
    WHERE pm.profile_id = ? AND pm.deleted_at IS NULL
    ORDER BY pm.position ASC
  `;

  const rows = await query<Record<string, SqlValue>>(sql, [profile_id]);

  return Promise.all(
    rows.map(async (row) => {
      const id = String(row.id);

      const last_episode: EpisodeRef | null =
        typeof row.last_ep_season === "number"
          ? {
              season: row.last_ep_season,
              episode: Number(row.last_ep_episode),
              name: String(row.last_ep_name),
              air_date: row.last_ep_air_date as string | null,
              overview: row.last_ep_overview as string | null,
              runtime: row.last_ep_runtime as number | null,
              still: row.last_ep_still as string | null,
            }
          : null;

      const next_episode: EpisodeRef | null =
        typeof row.next_ep_season === "number"
          ? {
              season: row.next_ep_season,
              episode: Number(row.next_ep_episode),
              name: String(row.next_ep_name),
              air_date: row.next_ep_air_date as string | null,
              overview: row.next_ep_overview as string | null,
              runtime: row.next_ep_runtime as number | null,
              still: row.next_ep_still as string | null,
            }
          : null;

      return {
        id,
        tmdb_id: Number(row.tmdb_id),
        name: String(row.name),
        media_type: toMediaType(row.media_type),
        status: toStatus(row.status),
        poster: row.poster as string | null,
        backdrop: row.backdrop as string | null,
        overview: String(row.overview),
        tagline: row.tagline as string | null,
        language: String(row.language),
        rating: row.rating as number | null,
        vote_count: row.vote_count as number | null,
        runtime: row.runtime as number | null,
        premiered: row.premiered as string | null,
        ended: row.ended as string | null,
        network: row.network as string | null,
        updated: Number(row.updated),
        number_of_seasons: row.number_of_seasons as number | null,
        number_of_episodes: row.number_of_episodes as number | null,
        release_date: row.release_date as string | null,
        genres: await loadGenres(id),
        last_episode,
        next_episode,
        watched: row.watched_flag !== 0,
      };
    }),
  );
}

async function loadGenres(media_id: string): Promise<string[]> {
  const rows = await query<{ genre: string }>(
    "SELECT genre FROM media_genres WHERE media_id = ? ORDER BY genre ASC",
    [media_id],
  );
  return rows.map((r) => r.genre);
}

export function createProfile(id: string, name: string, open: boolean) {
  return query("INSERT INTO profiles (id, name, open) VALUES (?, ?, ?)", [
    id,
    name,
    +open,
  ]);
}

/**
 * Updates a profile's basic info (e.g., renaming it).
 */
export async function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, "name" | "open">>,
): Promise<void> {
  // We handle the boolean -> integer mapping for SQLite here
  if (updates.name !== undefined) {
    await query("UPDATE profiles SET name = ? WHERE id = ?", [
      updates.name,
      id,
    ]);
  }

  if (updates.open !== undefined) {
    await query("UPDATE profiles SET open = ? WHERE id = ?", [
      updates.open ? 1 : 0,
      id,
    ]);
  }
}

/**
 * Deletes a profile and its associated media links.
 */
export async function deleteProfile(id: string): Promise<void> {
  // 1. Remove the media links first (Foreign Key hygiene)
  await query("DELETE FROM profile_media WHERE profile_id = ?", [id]);

  // 2. Delete the profile itself
  await query("DELETE FROM profiles WHERE id = ?", [id]);
}

export async function cloneProfile(
  id: string,
  new_id: string,
  new_name: string,
): Promise<void> {
  await query("INSERT INTO profiles (id, name, open) VALUES (?, ?, 1)", [
    new_id,
    new_name,
  ]);

  await query(
    `INSERT INTO profile_media (profile_id, media_id, position, added_at)
     SELECT ?, media_id, position, ?
     FROM profile_media
     WHERE profile_id = ? AND deleted_at IS NULL
     ORDER BY position ASC`,
    [new_id, Date.now(), id],
  );
}

// -- Media ---------------------------------------------------------------------

/**
 * Adds a nested Media object to a profile.
 * Handles flattening the last/next episode objects for the DB.
 */
export async function addMedia(
  profile_id: string,
  media: Media,
): Promise<string> {
  // 1. Resolve canonical ID (Check if this TMDB entry already exists in our 'media' table)
  const existing = await query<{ id: string }>(
    "SELECT id FROM media WHERE tmdb_id = ? AND media_type = ?",
    [media.tmdb_id, media.media_type],
  );

  let id = existing[0]?.id;

  // 2. If it's a new show/movie, INSERT it
  if (!id) {
    id = media.id; // Use the ID provided by the caller (likely a UUID)
    await query(
      `INSERT INTO media (
        id, tmdb_id, name, language, status, runtime, premiered, ended,
        rating, vote_count, network, overview, tagline, updated,
        poster, backdrop, media_type, number_of_seasons, number_of_episodes, release_date,
        last_ep_season, last_ep_episode, last_ep_name, last_ep_air_date,
        last_ep_overview, last_ep_runtime, last_ep_still,
        next_ep_season, next_ep_episode, next_ep_name, next_ep_air_date,
        next_ep_overview, next_ep_runtime, next_ep_still
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`,
      [
        id,
        media.tmdb_id,
        media.name,
        media.language,
        media.status,
        media.runtime,
        media.premiered,
        media.ended,
        media.rating,
        media.vote_count,
        media.network,
        media.overview,
        media.tagline,
        media.updated,
        media.poster,
        media.backdrop,
        media.media_type,
        media.number_of_seasons,
        media.number_of_episodes,
        media.release_date,
        media.last_episode?.season ?? null,
        media.last_episode?.episode ?? null,
        media.last_episode?.name ?? null,
        media.last_episode?.air_date ?? null,
        media.last_episode?.overview ?? null,
        media.last_episode?.runtime ?? null,
        media.last_episode?.still ?? null,
        media.next_episode?.season ?? null,
        media.next_episode?.episode ?? null,
        media.next_episode?.name ?? null,
        media.next_episode?.air_date ?? null,
        media.next_episode?.overview ?? null,
        media.next_episode?.runtime ?? null,
        media.next_episode?.still ?? null,
      ],
    );
  } else {
    // 3. If it exists, UPDATE to refresh metadata (TMDB scores, next air dates, etc.)
    await query(
      `UPDATE media SET
        name=?, status=?, runtime=?, rating=?, vote_count=?, updated=?,
        last_ep_season=?, last_ep_episode=?, last_ep_name=?, last_ep_air_date=?,
        next_ep_season=?, next_ep_episode=?, next_ep_name=?, next_ep_air_date=?
      WHERE id=?`,
      [
        media.name,
        media.status,
        media.runtime,
        media.rating,
        media.vote_count,
        Date.now(),
        media.last_episode?.season ?? null,
        media.last_episode?.episode ?? null,
        media.last_episode?.name ?? null,
        media.last_episode?.air_date ?? null,
        media.next_episode?.season ?? null,
        media.next_episode?.episode ?? null,
        media.next_episode?.name ?? null,
        media.next_episode?.air_date ?? null,
        id,
      ],
    );
  }

  // 4. Update Genres (Delete old, insert current)
  await query("DELETE FROM media_genres WHERE media_id = ?", [id]);
  for (const genre of media.genres) {
    await query("INSERT INTO media_genres (media_id, genre) VALUES (?, ?)", [
      id,
      genre,
    ]);
  }

  // 5. Link to Profile (Calculates the next 'position' in the list)
  const [pos_row] = await query<{ pos: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 as pos FROM profile_media WHERE profile_id = ? AND deleted_at IS NULL",
    [profile_id],
  );

  await query(
    `INSERT INTO profile_media (profile_id, media_id, position, added_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT (profile_id, media_id) DO UPDATE SET
       position = excluded.position,
       added_at = excluded.added_at,
       deleted_at = NULL`,
    [profile_id, id, pos_row.pos, Date.now()],
  );

  return id;
}

/**
 * Soft-deletes media from a profile.
 * Translates the .DELETE logic.
 */
export async function removeMedia(
  profile_id: string,
  media_id: string,
): Promise<void> {
  await query(
    "UPDATE profile_media SET deleted_at = ? WHERE profile_id = ? AND media_id = ?",
    [Date.now(), profile_id, media_id],
  );
}

/**
 * Updates a media record and its genres with fresh data from TMDB.
 */
export async function refreshMedia(
  media_id: string,
  fresh: Media,
): Promise<void> {
  const { last_episode: last, next_episode: next } = fresh;

  // 1. Update the core media metadata
  await query(
    `UPDATE media SET
      name=?, language=?, status=?, runtime=?, premiered=?, ended=?,
      rating=?, vote_count=?, network=?, overview=?, tagline=?, updated=?,
      poster=?, backdrop=?, number_of_seasons=?, number_of_episodes=?, release_date=?,
      last_ep_season=?, last_ep_episode=?, last_ep_name=?, last_ep_air_date=?,
      last_ep_overview=?, last_ep_runtime=?, last_ep_still=?,
      next_ep_season=?, next_ep_episode=?, next_ep_name=?, next_ep_air_date=?,
      next_ep_overview=?, next_ep_runtime=?, next_ep_still=?
    WHERE id=?`,
    [
      fresh.name,
      fresh.language,
      fresh.status,
      fresh.runtime,
      fresh.premiered,
      fresh.ended,
      fresh.rating,
      fresh.vote_count,
      fresh.network,
      fresh.overview,
      fresh.tagline,
      fresh.updated,
      fresh.poster,
      fresh.backdrop,
      fresh.number_of_seasons,
      fresh.number_of_episodes,
      fresh.release_date,
      last?.season ?? null,
      last?.episode ?? null,
      last?.name ?? null,
      last?.air_date ?? null,
      last?.overview ?? null,
      last?.runtime ?? null,
      last?.still ?? null,
      next?.season ?? null,
      next?.episode ?? null,
      next?.name ?? null,
      next?.air_date ?? null,
      next?.overview ?? null,
      next?.runtime ?? null,
      next?.still ?? null,
      media_id,
    ],
  );

  // 2. Refresh genres (Delete and Replace)
  await query("DELETE FROM media_genres WHERE media_id = ?", [media_id]);

  if (fresh.genres && fresh.genres.length > 0) {
    for (const genre of fresh.genres) {
      await query("INSERT INTO media_genres (media_id, genre) VALUES (?, ?)", [
        media_id,
        genre,
      ]);
    }
  }
}

export async function reorderMedia(
  profile_id: string,
  ids: string[],
): Promise<void> {
  // SQLite positions are usually 0-indexed or 1-indexed;
  // here we follow the Zig logic using the array index.
  for (let i = 0; i < ids.length; i++) {
    await query(
      "UPDATE profile_media SET position = ? WHERE profile_id = ? AND media_id = ?",
      [i, profile_id, ids[i]],
    );
  }
}

// -- Progress ------------------------------------------------------------------

export type EpisodeProgress = {
  episode_id: number;
  watched: boolean;
  season_number: number;
  episode_number: number;
};

/**
 * Fetches episode-level watch progress for a specific show and profile.
 */
export async function getProgress(
  profile_id: string,
  media_id: string,
): Promise<EpisodeProgress[]> {
  const rows = await query<{
    episode_id: number;
    watched: number; // SQLite stores booleans as 0 or 1
    season_number: number;
    episode_number: number;
  }>(
    `SELECT 
      ewp.episode_id, 
      ewp.watched, 
      e.season_number, 
      e.episode_number
     FROM episode_watch_progress ewp
     JOIN episodes e ON e.id = ewp.episode_id
     WHERE ewp.profile_id = ? AND ewp.media_id = ?`,
    [profile_id, media_id],
  );

  // Map the rows to convert the SQLite 'watched' integer into a boolean
  return rows.map((row) => ({
    ...row,
    watched: row.watched !== 0,
  }));
}

/**
 * Updates the global watch status for a media item in a specific profile.
 */
export async function updateMediaWatched(
  profile_id: string,
  media_id: string,
  watched: boolean,
): Promise<void> {
  const now = Date.now();

  // SQLite stores booleans as 1 (true) or 0 (false)
  const watched_int = watched ? 1 : 0;
  const watched_at = watched ? now : null;

  await query(
    `INSERT INTO watch_progress (
      profile_id, 
      media_id, 
      watched, 
      watched_at, 
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (profile_id, media_id) DO UPDATE SET
      watched = excluded.watched,
      watched_at = CASE 
        WHEN excluded.watched = 1 THEN excluded.watched_at 
        ELSE NULL 
      END,
      updated_at = excluded.updated_at`,
    [profile_id, media_id, watched_int, watched_at, now],
  );
}

export interface EpisodeProgressUpdate {
  media_id: string;
  season_number: number;
  episode_number: number;
  name: string;
  air_date: string | null;
  runtime: number | null;
  still: string | null;
  watched: boolean;
}

/**
 * Ensures season/episode rows exist and updates the watch progress.
 */
export async function updateEpisodeWatched(
  profile_id: string,
  episode_id: number, // Note: This is passed but the DB might re-verify via media_id/numbers
  update: EpisodeProgressUpdate,
): Promise<void> {
  const now = Date.now();
  const watched_int = update.watched ? 1 : 0;

  // 1. Verify Media exists
  const [media] = await query("SELECT id FROM media WHERE id = ?", [
    update.media_id,
  ]);
  if (!media) throw new Error("Media not found");

  // 2. Ensure Season exists
  await query(
    `INSERT INTO seasons (media_id, season_number, name, episode_count)
     VALUES (?, ?, '', 0)
     ON CONFLICT (media_id, season_number) DO NOTHING`,
    [update.media_id, update.season_number],
  );

  // 3. Upsert Episode and get the internal DB ID
  const upsert_res = await query<{ id: number }>(
    `INSERT INTO episodes (season_id, media_id, episode_number, season_number, name, air_date, runtime, still)
     SELECT s.id, ?, ?, ?, ?, ?, ?, ?
     FROM seasons s WHERE s.media_id = ? AND s.season_number = ?
     ON CONFLICT (media_id, season_number, episode_number) DO UPDATE SET
       name     = excluded.name,
       air_date = excluded.air_date,
       runtime  = excluded.runtime,
       still    = excluded.still
     RETURNING id`,
    [
      update.media_id,
      update.episode_number,
      update.season_number,
      update.name,
      update.air_date,
      update.runtime,
      update.still,
      update.media_id,
      update.season_number,
    ],
  );

  let internal_id = upsert_res[0]?.id;

  // Fallback: If RETURNING didn't give an ID (due to DO UPDATE), fetch it manually
  if (!internal_id) {
    const [sel] = await query<{ id: number }>(
      "SELECT id FROM episodes WHERE media_id = ? AND season_number = ? AND episode_number = ?",
      [update.media_id, update.season_number, update.episode_number],
    );
    if (!sel) throw new Error("Episode upsert failed");
    internal_id = sel.id;
  }

  // 4. Check for existing watch progress
  const [ewp] = await query(
    "SELECT 1 FROM episode_watch_progress WHERE profile_id = ? AND episode_id = ?",
    [profile_id, internal_id],
  );

  if (ewp) {
    // 5a. Update existing progress
    await query(
      `UPDATE episode_watch_progress SET
         watched = ?,
         watched_at = CASE WHEN ? = 1 THEN ? ELSE NULL END,
         updated_at = ?
       WHERE profile_id = ? AND episode_id = ?`,
      [watched_int, watched_int, now, now, profile_id, internal_id],
    );
  } else {
    // 5b. Insert new progress
    await query(
      `INSERT INTO episode_watch_progress
        (profile_id, episode_id, media_id, season_number, watched, watched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile_id,
        internal_id,
        update.media_id,
        update.season_number,
        watched_int,
        update.watched ? now : null,
        now,
      ],
    );
  }
}
