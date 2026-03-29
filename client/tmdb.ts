import type {
  Media,
  MediaDetails,
  EpisodeRef,
  CastMember,
  CrewMember,
  Video,
  DetailImage,
  ExternalIds,
  ContentRating,
  SeasonDetails,
  EpisodeDetails,
  NetworkInfo,
  ProductionCompany,
  Collection,
  WatchProviders,
  WatchProvider,
  Person,
  TMDB,
} from "$/types.d.ts";
import { local } from "./storage.svelte.ts";

export const IMAGE_BASE_W92 = "https://image.tmdb.org/t/p/w92";
export const IMAGE_BASE_W185 = "https://image.tmdb.org/t/p/w185";
export const IMAGE_BASE_W300 = "https://image.tmdb.org/t/p/w300";
export const IMAGE_BASE_W500 = "https://image.tmdb.org/t/p/w500";
export const IMAGE_BASE_W780 = "https://image.tmdb.org/t/p/w780";
export const IMAGE_BASE_W1280 = "https://image.tmdb.org/t/p/w1280";
export const IMAGE_BASE_ORIG = "https://image.tmdb.org/t/p/original";

// -- Config --------------------------------------------------------------------

const BASE_URL = "https://api.themoviedb.org/3";
const IMG = IMAGE_BASE_W500;
const IMG_BACK = IMAGE_BASE_W1280;
const IMG_PROF = IMAGE_BASE_W185;
const IMG_LOGO = IMAGE_BASE_W92;

// -- Core fetch ----------------------------------------------------------------

async function get<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${local.tmdb_key}`,
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// -- Image helpers -------------------------------------------------------------

const img = (path: string | null | undefined, base = IMG) =>
  path ? `${base}${path}` : null;
const imgBack = (path: string | null | undefined) => img(path, IMG_BACK);
const imgProf = (path: string | null | undefined) => img(path, IMG_PROF);
const imgLogo = (path: string | null | undefined) => img(path, IMG_LOGO);
const imgFull = (path: string, base: string) => `${base}${path}`;

// -- Mappers -------------------------------------------------------------------

function mapSearchResult(
  r: TMDB.SearchResultItem,
  type: "tv" | "movie" = r.media_type as "tv" | "movie",
): Media {
  return {
    id: "",
    tmdb_id: r.id,
    name: r.name ?? r.title ?? "",
    language: r.original_language,
    genres: [],
    status: "Returning Series" as const,
    runtime: null,
    premiered: r.first_air_date ?? r.release_date ?? null,
    ended: null,
    rating: r.vote_average || null,
    vote_count: r.vote_count || null,
    network: null,
    overview: r.overview,
    tagline: null,
    updated: Date.now(),
    poster: img(r.poster_path),
    backdrop: imgBack(r.backdrop_path),
    media_type: type,
    number_of_seasons: null,
    number_of_episodes: null,
    last_episode: null,
    next_episode: null,
    release_date: r.release_date ?? null,
    watched: false,
  };
}

function mapEpisodeRef(ep: TMDB.EpisodeToAir): EpisodeRef {
  return {
    season: ep.season_number,
    episode: ep.episode_number,
    name: ep.name,
    air_date: ep.air_date ?? null,
    overview: ep.overview || null,
    runtime: ep.runtime ?? null,
    still: img(ep.still_path, IMAGE_BASE_W300),
  };
}

function mapTVMedia(tv: TMDB.TVSeries): Media {
  return {
    id: "",
    tmdb_id: tv.id,
    name: tv.name,
    language: tv.original_language,
    genres: (tv.genres ?? []).map((g) => g.name),
    status: tv.status,
    runtime: tv.episode_run_time[0] ?? null,
    premiered: tv.first_air_date || null,
    ended: tv.last_air_date ?? null,
    rating: tv.vote_average || null,
    vote_count: tv.vote_count || null,
    network: tv.networks[0]?.name ?? null,
    overview: tv.overview,
    tagline: tv.tagline || null,
    updated: Date.now(),
    poster: img(tv.poster_path),
    backdrop: imgBack(tv.backdrop_path),
    media_type: "tv",
    number_of_seasons: tv.number_of_seasons,
    number_of_episodes: tv.number_of_episodes,
    last_episode: tv.last_episode_to_air
      ? mapEpisodeRef(tv.last_episode_to_air)
      : null,
    next_episode: tv.next_episode_to_air
      ? mapEpisodeRef(tv.next_episode_to_air)
      : null,
    release_date: null,
    watched: false,
  };
}

function mapMovieMedia(movie: TMDB.Movie): Media {
  return {
    id: "",
    tmdb_id: movie.id,
    name: movie.title,
    language: movie.original_language,
    genres: (movie.genres ?? []).map((g) => g.name),
    status: movie.status === "Released" ? "Released" : "In Production",
    runtime: movie.runtime ?? null,
    premiered: movie.release_date || null,
    ended: null,
    rating: movie.vote_average || null,
    vote_count: movie.vote_count || null,
    network: movie.production_companies?.[0]?.name ?? null,
    overview: movie.overview,
    tagline: movie.tagline || null,
    updated: Date.now(),
    poster: img(movie.poster_path),
    backdrop: imgBack(movie.backdrop_path),
    media_type: "movie",
    number_of_seasons: null,
    number_of_episodes: null,
    last_episode: null,
    next_episode: null,
    release_date: movie.release_date || null,
    watched: false,
  };
}

function mapCast(cast: TMDB.CastMember[]): CastMember[] {
  return cast.slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    cast_order: c.order,
    profile_photo: imgProf(c.profile_path),
    known_for: c.known_for_department || null,
  }));
}

function mapCrew(crew: TMDB.CrewMember[]): CrewMember[] {
  return crew.map((c) => ({
    id: c.id,
    name: c.name,
    job: c.job,
    department: c.department,
    profile_photo: imgProf(c.profile_path),
  }));
}

function mapVideos(videos: TMDB.Video[]): Video[] {
  return videos
    .filter((v) => v.site === "YouTube")
    .map((v) => ({
      id: v.id,
      name: v.name,
      key: v.key,
      site: v.site,
      type: v.type as Video["type"],
      official: v.official,
      published_at: v.published_at,
    }));
}

function mapImage(i: TMDB.Image, base: string): DetailImage {
  return {
    file_path: imgFull(i.file_path, base),
    width: i.width,
    height: i.height,
    aspect_ratio: i.aspect_ratio,
    vote_average: i.vote_average,
    language: i.iso_639_1 ?? null,
  };
}

function mapExternalIds(e: TMDB.ExternalIds): ExternalIds {
  return {
    imdb_id: e.imdb_id ?? null,
    tvdb_id: e.tvdb_id ?? null,
    instagram_id: e.instagram_id ?? null,
    twitter_id: e.twitter_id ?? null,
    facebook_id: e.facebook_id ?? null,
    wikidata_id: e.wikidata_id ?? null,
  };
}

function mapWatchProviders(
  raw: TMDB.WatchProvidersResponse["results"],
): WatchProviders {
  const out: WatchProviders = {};
  for (const [country, data] of Object.entries(raw)) {
    const mapProviders = (list?: TMDB.WatchProvider[]): WatchProvider[] =>
      (list ?? []).map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: imgLogo(p.logo_path),
        display_priority: p.display_priority,
      }));
    out[country] = {
      link: data.link,
      flatrate: mapProviders(data.flatrate),
      rent: mapProviders(data.rent),
      buy: mapProviders(data.buy),
      free: mapProviders(data.free),
      ads: mapProviders(data.ads),
    };
  }
  return out;
}

function mapNetworks(networks: TMDB.Network[]): NetworkInfo[] {
  return networks.map((n) => ({
    id: n.id,
    name: n.name,
    logo: imgLogo(n.logo_path),
    origin_country: n.origin_country,
  }));
}

function mapProductionCompanies(
  companies: TMDB.ProductionCompany[],
): ProductionCompany[] {
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    logo: imgLogo(c.logo_path),
    origin_country: c.origin_country,
  }));
}

function mapCreatedBy(creators: TMDB.CreatedBy[]): Person[] {
  return creators.map((c) => ({
    id: c.id,
    name: c.name,
    profile_photo: imgProf(c.profile_path),
  }));
}

function mapEpisodeDetails(
  ep: TMDB.Episode,
  season_number: number,
): EpisodeDetails {
  return {
    id: ep.id,
    episode_number: ep.episode_number,
    season_number,
    name: ep.name,
    overview: ep.overview || "",
    air_date: ep.air_date ?? null,
    runtime: ep.runtime ?? null,
    still: img(ep.still_path, IMAGE_BASE_W300),
    rating: ep.vote_average || null,
    vote_count: ep.vote_count || null,
    watched: false,
    directors: ep.crew.filter((c) => c.job === "Director").map((c) => c.name),
    writers: ep.crew
      .filter((c) => ["Writer", "Screenplay", "Story"].includes(c.job))
      .map((c) => c.name),
    guest_stars: ep.guest_stars.map((g) => ({
      id: g.id,
      name: g.name,
      character: g.character,
      cast_order: g.order,
      profile_photo: imgProf(g.profile_path),
      known_for: null,
    })),
  };
}

// -- Public API ----------------------------------------------------------------

/** Search for TV shows and movies. Returns lean Media summaries. */
export async function search(query: string): Promise<Media[]> {
  const data = await get<TMDB.SearchResult>("/search/multi", {
    query,
    include_adult: "false",
  });
  return data.results
    .filter((r) => r.media_type === "tv" || r.media_type === "movie")
    .map((r) => mapSearchResult(r));
}

/** Fetch full Media summary for a single TV show. */
export async function fetchTV(tmdb_id: number): Promise<Media> {
  const tv = await get<TMDB.TVSeries>(`/tv/${tmdb_id}`);
  return mapTVMedia(tv);
}

/** Fetch full Media summary for a single movie. */
export async function fetchMovie(tmdb_id: number): Promise<Media> {
  const movie = await get<TMDB.Movie>(`/movie/${tmdb_id}`);
  return mapMovieMedia(movie);
}

/** Fetch full MediaDetails for a TV show (all sub-requests in parallel). */
export async function fetchTVDetails(tmdb_id: number): Promise<MediaDetails> {
  const [
    tv,
    credits,
    videos,
    images,
    keywords,
    external_ids,
    content_ratings,
    watch_providers,
  ] = await Promise.all([
    get<TMDB.TVSeries>(`/tv/${tmdb_id}`),
    get<TMDB.Credits>(`/tv/${tmdb_id}/credits`),
    get<TMDB.VideosResponse>(`/tv/${tmdb_id}/videos`),
    get<TMDB.Images>(`/tv/${tmdb_id}/images`, {
      include_image_language: "en,null",
    }),
    get<TMDB.KeywordsResponse>(`/tv/${tmdb_id}/keywords`),
    get<TMDB.ExternalIds>(`/tv/${tmdb_id}/external_ids`),
    get<TMDB.ContentRatingsResponse>(`/tv/${tmdb_id}/content_ratings`),
    get<TMDB.WatchProvidersResponse>(`/tv/${tmdb_id}/watch/providers`),
  ]);

  const main_seasons = tv.seasons.filter((s) => s.season_number > 0);
  const season_details = await Promise.all(
    main_seasons.map((s) =>
      get<TMDB.SeasonDetails>(`/tv/${tmdb_id}/season/${s.season_number}`),
    ),
  );

  const media = mapTVMedia(tv);

  const seasons: SeasonDetails[] = season_details.map((s, i) => ({
    id: s.id,
    season_number: s.season_number,
    name: s.name,
    overview: s.overview || "",
    poster: img(s.poster_path),
    air_date: s.air_date ?? null,
    episode_count: main_seasons[i].episode_count,
    vote_average: s.vote_average,
    episodes: s.episodes.map((ep) => mapEpisodeDetails(ep, s.season_number)),
  }));

  const content_ratings_mapped: ContentRating[] = content_ratings.results.map(
    (r) => ({
      country: r.iso_3166_1,
      rating: r.rating,
      descriptors: r.descriptors ?? [],
    }),
  );

  return {
    media,
    cast: mapCast(credits.cast),
    crew: mapCrew(credits.crew),
    videos: mapVideos(videos.results),
    images: {
      posters: images.posters.map((i) => mapImage(i, IMG)),
      backdrops: images.backdrops.map((i) => mapImage(i, IMG_BACK)),
      logos: images.logos.map((i) => mapImage(i, IMAGE_BASE_W500)),
    },
    similar: [],
    recommendations: await fetchRecommendations(tmdb_id, "tv"),
    keywords: (keywords.results ?? []).map((k) => k.name),
    external_ids: mapExternalIds(external_ids),
    content_ratings: content_ratings_mapped,
    seasons,
    created_by: mapCreatedBy(tv.created_by),
    networks: mapNetworks(tv.networks),
    collection: null,
    production_companies: [],
    budget: null,
    revenue: null,
    watch_providers: mapWatchProviders(watch_providers.results),
  };
}

/** Fetch full MediaDetails for a movie (all sub-requests in parallel). */
export async function fetchMovieDetails(
  tmdb_id: number,
): Promise<MediaDetails> {
  const [
    movie,
    credits,
    videos,
    images,
    keywords,
    external_ids,
    release_dates,
    watch_providers,
  ] = await Promise.all([
    get<TMDB.Movie>(`/movie/${tmdb_id}`),
    get<TMDB.Credits>(`/movie/${tmdb_id}/credits`),
    get<TMDB.VideosResponse>(`/movie/${tmdb_id}/videos`),
    get<TMDB.Images>(`/movie/${tmdb_id}/images`, {
      include_image_language: "en,null",
    }),
    get<TMDB.KeywordsResponse>(`/movie/${tmdb_id}/keywords`),
    get<TMDB.ExternalIds>(`/movie/${tmdb_id}/external_ids`),
    get<TMDB.ReleaseDatesResponse>(`/movie/${tmdb_id}/release_dates`),
    get<TMDB.WatchProvidersResponse>(`/movie/${tmdb_id}/watch/providers`),
  ]);

  const media = mapMovieMedia(movie);

  const content_ratings: ContentRating[] = release_dates.results.flatMap(
    (country) =>
      country.release_dates
        .filter((rd) => rd.certification)
        .map((rd) => ({
          country: country.iso_3166_1,
          rating: rd.certification,
          descriptors: rd.descriptors ?? [],
        })),
  );

  let mapped_collection: Collection | null = null;
  if (movie.belongs_to_collection) {
    const col = await get<{
      id: number;
      name: string;
      poster_path: string | null;
      backdrop_path: string | null;
      parts: Array<TMDB.Movie & { media_type?: string }>;
    }>(`/collection/${movie.belongs_to_collection.id}`);

    mapped_collection = {
      id: col.id,
      name: col.name,
      poster: img(col.poster_path),
      backdrop: imgBack(col.backdrop_path),
      parts: col.parts.map((p) => ({ ...mapMovieMedia(p), id: "" })),
    };
  }

  return {
    media,
    cast: mapCast(credits.cast),
    crew: mapCrew(credits.crew),
    videos: mapVideos(videos.results),
    images: {
      posters: images.posters.map((i) => mapImage(i, IMG)),
      backdrops: images.backdrops.map((i) => mapImage(i, IMG_BACK)),
      logos: images.logos.map((i) => mapImage(i, IMAGE_BASE_W500)),
    },
    similar: [],
    recommendations: await fetchRecommendations(tmdb_id, "movie"),
    keywords: (keywords.keywords ?? []).map((k) => k.name),
    external_ids: mapExternalIds(external_ids),
    content_ratings,
    seasons: [],
    created_by: [],
    networks: [],
    collection: mapped_collection,
    production_companies: mapProductionCompanies(movie.production_companies),
    budget: movie.budget || null,
    revenue: movie.revenue || null,
    watch_providers: mapWatchProviders(watch_providers.results),
  };
}

/** Shared recommendations fetcher. */
async function fetchRecommendations(
  tmdb_id: number,
  type: "tv" | "movie",
): Promise<Media[]> {
  const data = await get<{ results: TMDB.SearchResultItem[] }>(
    `/${type}/${tmdb_id}/recommendations`,
  );
  return data.results.slice(0, 10).map((r) => mapSearchResult(r, type));
}
