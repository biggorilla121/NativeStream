import {
  TMDBListResponse,
  TMDBMovie,
  TMDBShow,
  TMDBSeason,
  TMDBEpisode
} from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const token = import.meta.env.VITE_TMDB_READ_TOKEN;

if (!token) {
  console.warn("Missing VITE_TMDB_READ_TOKEN. Add it to your .env file.");
}

const cache = new Map<string, any>();

const buildUrl = (path: string, params?: Record<string, string>) => {
  const url = new URL(`${TMDB_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const tmdbFetch = async <T>(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal
): Promise<T> => {
  const url = buildUrl(path, params);
  if (cache.has(url)) return cache.get(url) as T;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    signal
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`TMDB error ${res.status}: ${message}`);
  }

  const data = (await res.json()) as T;
  cache.set(url, data);
  return data;
};

export const tmdb = {
  trendingAll: () =>
    tmdbFetch<TMDBListResponse<TMDBMovie | TMDBShow>>("/trending/all/day"),
  topRatedMovies: () => tmdbFetch<TMDBListResponse<TMDBMovie>>("/movie/top_rated"),
  topRatedShows: () => tmdbFetch<TMDBListResponse<TMDBShow>>("/tv/top_rated"),
  searchMulti: (query: string, signal?: AbortSignal) =>
    tmdbFetch<TMDBListResponse<TMDBMovie | TMDBShow>>("/search/multi", {
      query,
      include_adult: "false",
      language: "en-US"
    }, signal),
  movieDetails: (id: number) => tmdbFetch<TMDBMovie>(`/movie/${id}`),
  tvDetails: (id: number) => tmdbFetch<TMDBShow>(`/tv/${id}`),
  tvSeason: (id: number, season: number) =>
    tmdbFetch<TMDBSeason & { episodes: TMDBEpisode[] }>(`/tv/${id}/season/${season}`)
};

export const imageUrl = (path?: string | null, size: "w500" | "original" = "w500") => {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
};
