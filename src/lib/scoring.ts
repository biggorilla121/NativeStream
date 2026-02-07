import { TMDBMediaBase } from "./types";

const normalize = (value: string) => value.toLowerCase().normalize("NFKD");

const tokenize = (value: string) =>
  normalize(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

export const rankResults = <T extends TMDBMediaBase>(query: string, items: T[]) => {
  const q = normalize(query);
  const tokens = tokenize(query);

  return items
    .map((item) => {
      const title = normalize((item as any).title ?? (item as any).name ?? "");
      const original = normalize((item as any).original_title ?? (item as any).original_name ?? "");
      const overview = normalize(item.overview ?? "");
      const yearMatch = /\b(19|20)\d{2}\b/.exec(q)?.[0];
      let score = 0;

      if (title.startsWith(q) || original.startsWith(q)) score += 6;
      if (title.includes(q) || original.includes(q)) score += 4;

      for (const token of tokens) {
        if (title.includes(token)) score += 2;
        if (original.includes(token)) score += 1.5;
        if (overview.includes(token)) score += 0.5;
      }

      if (yearMatch) {
        const date = (item as any).release_date ?? (item as any).first_air_date ?? "";
        if (date.startsWith(yearMatch)) score += 3;
      }

      score += Math.min(5, (item.popularity ?? 0) / 20);
      score += Math.min(2, (item.vote_average ?? 0) / 5);

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
};
