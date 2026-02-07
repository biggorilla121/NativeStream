export type MediaType = "movie" | "tv";

export interface TMDBListResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMediaBase {
  id: number;
  media_type?: MediaType;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
}

export interface TMDBMovie extends TMDBMediaBase {
  media_type?: "movie";
  title?: string;
  original_title?: string;
  release_date?: string;
  runtime?: number;
  genres?: { id: number; name: string }[];
}

export interface TMDBShow extends TMDBMediaBase {
  media_type?: "tv";
  name?: string;
  original_name?: string;
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TMDBSeason[];
  genres?: { id: number; name: string }[];
}

export interface TMDBSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path?: string | null;
}

export interface TMDBEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview?: string;
  still_path?: string | null;
  air_date?: string;
}

export interface HistoryItem {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path?: string | null;
  last_opened: string;
}

export interface SearchHistoryItem {
  query: string;
  last_searched: string;
}

export interface WatchProgressItem {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path?: string | null;
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  progress: number;
  updated_at: string;
}
