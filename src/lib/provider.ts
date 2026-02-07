import { MediaType } from "./types";

const DEFAULT_MOVIE_TEMPLATE = "https://www.vidking.net/embed/movie/{id}";
const DEFAULT_TV_TEMPLATE = "https://www.vidking.net/embed/tv/{id}/{season}/{episode}";

const templateFor = (type: MediaType) => {
  if (type === "movie") {
    return import.meta.env.VITE_PROVIDER_MOVIE_TEMPLATE ?? DEFAULT_MOVIE_TEMPLATE;
  }
  return import.meta.env.VITE_PROVIDER_TV_TEMPLATE ?? DEFAULT_TV_TEMPLATE;
};

export interface ProviderOptions {
  color?: string;
  autoPlay?: boolean;
  nextEpisode?: boolean;
  episodeSelector?: boolean;
  progress?: number;
}

const normalizeColor = (value?: string) => {
  if (!value) return undefined;
  return value.replace("#", "").trim();
};

export const buildProviderUrl = (
  type: MediaType,
  id: number,
  season?: number,
  episode?: number,
  options?: ProviderOptions
) => {
  const template = templateFor(type);
  const base = template
    .replace("{id}", String(id))
    .replace("{season}", String(season ?? 1))
    .replace("{episode}", String(episode ?? 1));

  const params = new URLSearchParams();
  const color = normalizeColor(options?.color);
  if (color) params.set("color", color);
  if (options?.autoPlay) params.set("autoPlay", "true");
  if (type === "tv" && options?.nextEpisode) params.set("nextEpisode", "true");
  if (type === "tv" && options?.episodeSelector) params.set("episodeSelector", "true");
  if (options?.progress && options.progress > 0) {
    params.set("progress", String(Math.floor(options.progress)));
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
};
