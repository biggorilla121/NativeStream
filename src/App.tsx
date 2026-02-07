import { useEffect, useMemo, useRef, useState } from "react";
import { buildProviderUrl } from "./lib/provider";
import { rankResults } from "./lib/scoring";
import { storage } from "./lib/storage";
import { imageUrl, tmdb } from "./lib/tmdb";
import {
  HistoryItem,
  MediaType,
  SearchHistoryItem,
  TMDBEpisode,
  TMDBMediaBase,
  TMDBMovie,
  TMDBSeason,
  TMDBShow,
  WatchProgressItem
} from "./lib/types";

const HISTORY_KEY = "ns.history";
const SEARCH_HISTORY_KEY = "ns.search.history";
const PROGRESS_KEY = "ns.progress";
const PLAYER_SETTINGS_KEY = "ns.player.settings";

interface PlayerMeta {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path?: string | null;
  season?: number;
  episode?: number;
  startAt?: number;
}

interface PlayerSettings {
  color: string;
  autoPlay: boolean;
  nextEpisode: boolean;
  episodeSelector: boolean;
}

const DEFAULT_SETTINGS: PlayerSettings = {
  color: "6cf2d6",
  autoPlay: true,
  nextEpisode: true,
  episodeSelector: true
};

const titleFor = (item: TMDBMediaBase) =>
  (item as TMDBMovie).title ?? (item as TMDBShow).name ?? "Untitled";

const dateFor = (item: TMDBMediaBase) =>
  (item as TMDBMovie).release_date ?? (item as TMDBShow).first_air_date ?? "";

const withType = <T extends TMDBMediaBase>(items: T[], type: MediaType) =>
  items.map((item) => ({ ...item, media_type: type }));

const formatTime = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padded = secs.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${padded}`;
  }
  return `${minutes}:${padded}`;
};

const progressKey = (item: Pick<WatchProgressItem, "id" | "media_type" | "season" | "episode">) =>
  `${item.media_type}:${item.id}:${item.season ?? 0}:${item.episode ?? 0}`;

export default function App() {
  const [mode, setMode] = useState<"home" | "detail" | "player">("home");
  const [activeTab, setActiveTab] = useState<"home" | "library">("home");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBMediaBase[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [trending, setTrending] = useState<TMDBMediaBase[]>([]);
  const [topMovies, setTopMovies] = useState<TMDBMediaBase[]>([]);
  const [topShows, setTopShows] = useState<TMDBMediaBase[]>([]);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [selected, setSelected] = useState<TMDBMediaBase | null>(null);
  const [detailData, setDetailData] = useState<TMDBMovie | TMDBShow | null>(null);
  const [seasonList, setSeasonList] = useState<TMDBSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);

  const [playerMeta, setPlayerMeta] = useState<PlayerMeta | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(
    storage.get<HistoryItem[]>(HISTORY_KEY, [])
  );
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(
    storage.get<SearchHistoryItem[]>(SEARCH_HISTORY_KEY, [])
  );
  const [progressItems, setProgressItems] = useState<WatchProgressItem[]>(
    storage.get<WatchProgressItem[]>(PROGRESS_KEY, [])
  );
  const [playerSettings, setPlayerSettings] = useState<PlayerSettings>(
    storage.get<PlayerSettings>(PLAYER_SETTINGS_KEY, DEFAULT_SETTINGS)
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  const progressRef = useRef(progressItems);
  const playerMetaRef = useRef(playerMeta);

  useEffect(() => {
    progressRef.current = progressItems;
  }, [progressItems]);

  useEffect(() => {
    playerMetaRef.current = playerMeta;
  }, [playerMeta]);

  useEffect(() => {
    storage.set(PLAYER_SETTINGS_KEY, playerSettings);
  }, [playerSettings]);

  const heroItem = trending[0];

  const updateHistory = (item: TMDBMediaBase) => {
    const entry: HistoryItem = {
      id: item.id,
      media_type: (item.media_type ?? "movie") as MediaType,
      title: titleFor(item),
      poster_path: item.poster_path,
      last_opened: new Date().toISOString()
    };

    setHistory((prev) => {
      const filtered = prev.filter(
        (existing) => !(existing.id === entry.id && existing.media_type === entry.media_type)
      );
      const next = [entry, ...filtered].slice(0, 20);
      storage.set(HISTORY_KEY, next);
      return next;
    });
  };

  const updateSearchHistory = (value: string) => {
    const entry: SearchHistoryItem = {
      query: value,
      last_searched: new Date().toISOString()
    };

    setSearchHistory((prev) => {
      const filtered = prev.filter((existing) => existing.query !== entry.query);
      const next = [entry, ...filtered].slice(0, 10);
      storage.set(SEARCH_HISTORY_KEY, next);
      return next;
    });
  };

  const updateProgress = (nextEntry: WatchProgressItem) => {
    setProgressItems((prev) => {
      const key = progressKey(nextEntry);
      const filtered = prev.filter((item) => progressKey(item) !== key);
      const next = [nextEntry, ...filtered].slice(0, 50);
      storage.set(PROGRESS_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.origin.includes("vidking.net")) return;
      if (typeof event.data !== "string") return;

      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload || payload.type !== "PLAYER_EVENT") return;
      const data = payload.data;
      if (!data || !data.id) return;

      const id = Number(data.id);
      if (!Number.isFinite(id)) return;

      const mediaType = (data.mediaType ?? data.type ?? data.media_type) as MediaType | undefined;
      if (!mediaType) return;

      const currentTime = Number(data.currentTime ?? 0);
      const duration = Number(data.duration ?? 0);
      const progress = Number(data.progress ?? 0);
      const season = data.season ? Number(data.season) : undefined;
      const episode = data.episode ? Number(data.episode) : undefined;

      const meta = playerMetaRef.current;
      const existing = progressRef.current.find(
        (item) => progressKey(item) === progressKey({ id, media_type: mediaType, season, episode })
      );

      const title = existing?.title ?? meta?.title ?? `ID ${id}`;
      const poster_path = existing?.poster_path ?? meta?.poster_path ?? undefined;

      updateProgress({
        id,
        media_type: mediaType,
        title,
        poster_path,
        season,
        episode,
        currentTime,
        duration,
        progress,
        updated_at: new Date().toISOString()
      });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const loadHome = async () => {
      try {
        const [trend, movies, shows] = await Promise.all([
          tmdb.trendingAll(),
          tmdb.topRatedMovies(),
          tmdb.topRatedShows()
        ]);

        setTrending(
          trend.results
            .filter((item) => item.media_type === "movie" || item.media_type === "tv")
            .slice(0, 12)
        );
        setTopMovies(withType(movies.results.slice(0, 12), "movie"));
        setTopShows(withType(shows.results.slice(0, 12), "tv"));
      } catch (err) {
        setHomeError((err as Error).message);
      }
    };

    loadHome();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);
        const data = await tmdb.searchMulti(query.trim(), controller.signal);
        const filtered = data.results.filter(
          (item) => item.media_type === "movie" || item.media_type === "tv"
        );
        const ranked = rankResults(query, filtered);
        setSearchResults(ranked.slice(0, 24));
        updateSearchHistory(query.trim());
      } catch (err) {
        if (!controller.signal.aborted) {
          setSearchError((err as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    const loadDetails = async () => {
      if (!selected) return;
      try {
        const type = selected.media_type ?? "movie";
        if (type === "movie") {
          const data = await tmdb.movieDetails(selected.id);
          setDetailData({ ...data, media_type: "movie" });
          setSeasonList([]);
          setEpisodes([]);
        } else {
          const data = await tmdb.tvDetails(selected.id);
          setDetailData({ ...data, media_type: "tv" });
          setSeasonList(data.seasons ?? []);
          setSelectedSeason(data.seasons?.[0]?.season_number ?? 1);
        }
      } catch (err) {
        setDetailData(null);
        console.error(err);
      }
    };

    loadDetails();
  }, [selected]);

  useEffect(() => {
    const loadSeason = async () => {
      if (!detailData || detailData.media_type !== "tv") return;
      try {
        const data = await tmdb.tvSeason(detailData.id, selectedSeason);
        setEpisodes(data.episodes ?? []);
      } catch (err) {
        console.error(err);
      }
    };

    loadSeason();
  }, [detailData, selectedSeason]);

  const openDetail = (item: TMDBMediaBase) => {
    updateHistory(item);
    setSelected(item);
    setMode("detail");
  };

  const openPlayer = (
    type: MediaType,
    id: number,
    title: string,
    season?: number,
    episode?: number,
    startAt?: number,
    poster_path?: string | null
  ) => {
    if (!selected || selected.id !== id || selected.media_type !== type) {
      setSelected({ id, media_type: type, poster_path } as TMDBMediaBase);
    }
    const historyStub = { id, media_type: type, poster_path } as TMDBMediaBase;
    if (type === "movie") {
      (historyStub as TMDBMovie).title = title;
    } else {
      (historyStub as TMDBShow).name = title;
    }
    updateHistory(historyStub);
    setPlayerMeta({
      id,
      media_type: type,
      title,
      poster_path: poster_path ?? detailData?.poster_path ?? selected?.poster_path,
      season,
      episode,
      startAt
    });
    setMode("player");
  };

  const playerUrl = useMemo(() => {
    if (!playerMeta) return null;
    return buildProviderUrl(playerMeta.media_type, playerMeta.id, playerMeta.season, playerMeta.episode, {
      color: playerSettings.color,
      autoPlay: playerSettings.autoPlay,
      nextEpisode: playerSettings.nextEpisode,
      episodeSelector: playerSettings.episodeSelector,
      progress: playerMeta.startAt
    });
  }, [playerMeta, playerSettings]);

  const trendingLabel = useMemo(() => {
    if (!heroItem) return "";
    const type = heroItem.media_type === "tv" ? "Series" : "Film";
    const year = dateFor(heroItem).slice(0, 4);
    return `${type}${year ? ` · ${year}` : ""}`;
  }, [heroItem]);

  const resumeItem = useMemo(() => {
    if (!selected) return null;
    const type = (selected.media_type ?? "movie") as MediaType;
    const matches = progressItems.filter(
      (item) => item.id === selected.id && item.media_type === type
    );
    if (matches.length === 0) return null;
    return matches.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
  }, [progressItems, selected]);

  const continueWatching = useMemo(() => {
    return [...progressItems]
      .filter((item) => item.progress > 0)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 12);
  }, [progressItems]);

  const activeProgress = useMemo(() => {
    if (!playerMeta) return null;
    const match = progressItems.find(
      (item) => progressKey(item) === progressKey(playerMeta)
    );
    return match ?? null;
  }, [playerMeta, progressItems]);

  const toggleFullscreen = async () => {
    try {
      setFullscreenError(null);
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      try {
        await win.setSimpleFullscreen(next);
      } catch {
        await win.setFullscreen(next);
      }
      setIsFullscreen(next);
    } catch (err) {
      setFullscreenError((err as Error).message ?? "Fullscreen failed");
      console.warn("Fullscreen not available", err);
    }
  };

  useEffect(() => {
    if (mode !== "player") return;
    let active = true;
    let timer: number | undefined;
    const sync = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const state = await win.isFullscreen();
        if (active) setIsFullscreen(state);
      } catch {
        // Ignore when not running inside Tauri.
      }
    };
    sync();
    timer = window.setInterval(sync, 1500);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [mode]);

  return (
    <div className={`app ${mode === "player" && isFullscreen ? "fullscreen" : ""}`}>
      <header>
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <h1>NativeStream</h1>
            <span>Fast desktop streaming hub</span>
          </div>
        </div>
        <nav>
          <button
            className={`nav-button ${activeTab === "home" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("home");
              setMode("home");
            }}
          >
            Home
          </button>
          <button
            className={`nav-button ${activeTab === "library" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("library");
              setMode("home");
            }}
          >
            Library
          </button>
        </nav>
      </header>

      <main>
        {mode === "player" && playerUrl && playerMeta ? (
          <div className="panel fade-in">
            <div className="section-title">
              <h3>{playerMeta.title}</h3>
              <span>Streaming via provider iframe</span>
            </div>
            <div className="player">
              <iframe
                key={playerUrl}
                title={playerMeta.title}
                src={playerUrl}
                allow="fullscreen; autoplay; picture-in-picture"
                allowFullScreen
                webkitAllowFullScreen
                mozAllowFullScreen
              />
            </div>
            <div className="action-row" style={{ marginTop: "18px" }}>
              {activeProgress && (
                <span className="badge">
                  {activeProgress.progress.toFixed(1)}% · {formatTime(activeProgress.currentTime)}
                </span>
              )}
              <button className="secondary" onClick={toggleFullscreen}>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
              {fullscreenError && (
                <span style={{ color: "var(--danger)" }}>{fullscreenError}</span>
              )}
              <button className="secondary" onClick={() => setMode("detail")}>
                Back to details
              </button>
              <button className="secondary" onClick={() => setMode("home")}>
                Back to home
              </button>
            </div>

            <div className="panel" style={{ marginTop: "18px" }}>
              <div className="section-title">
                <h3>Player options</h3>
                <span>Vidking embed settings</span>
              </div>
              <div className="list">
                <label className="list-item">
                  <strong>Auto-play</strong>
                  <input
                    type="checkbox"
                    checked={playerSettings.autoPlay}
                    onChange={(event) =>
                      setPlayerSettings((prev) => ({ ...prev, autoPlay: event.target.checked }))
                    }
                  />
                </label>
                <label className="list-item">
                  <strong>Next episode</strong>
                  <input
                    type="checkbox"
                    checked={playerSettings.nextEpisode}
                    onChange={(event) =>
                      setPlayerSettings((prev) => ({ ...prev, nextEpisode: event.target.checked }))
                    }
                  />
                </label>
                <label className="list-item">
                  <strong>Episode selector</strong>
                  <input
                    type="checkbox"
                    checked={playerSettings.episodeSelector}
                    onChange={(event) =>
                      setPlayerSettings((prev) => ({
                        ...prev,
                        episodeSelector: event.target.checked
                      }))
                    }
                  />
                </label>
                <label className="list-item">
                  <strong>Theme color</strong>
                  <input
                    type="text"
                    value={playerSettings.color}
                    onChange={(event) =>
                      setPlayerSettings((prev) => ({
                        ...prev,
                        color: event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        ) : mode === "detail" && selected && detailData ? (
          <div className="panel fade-in">
            <div className="section-title">
              <h3>Details</h3>
              <span>{detailData.media_type === "tv" ? "Series" : "Film"}</span>
            </div>
            <div className="detail">
              <img
                src={imageUrl(detailData.poster_path, "w500")}
                alt={titleFor(detailData)}
              />
              <div className="detail-content">
                <h2>{titleFor(detailData)}</h2>
                <div className="action-row">
                  <span className="badge">Rating {detailData.vote_average?.toFixed(1) ?? "-"}</span>
                  {detailData.genres?.slice(0, 3).map((genre) => (
                    <span key={genre.id} className="badge">
                      {genre.name}
                    </span>
                  ))}
                </div>
                <p>{detailData.overview}</p>
                <div className="action-row">
                  {resumeItem && (
                    <button
                      className="primary"
                      onClick={() =>
                        openPlayer(
                          resumeItem.media_type,
                          resumeItem.id,
                          resumeItem.title,
                          resumeItem.season,
                          resumeItem.episode,
                          resumeItem.currentTime,
                          resumeItem.poster_path
                        )
                      }
                    >
                      Resume {resumeItem.media_type === "tv" && resumeItem.season
                        ? `S${resumeItem.season}E${resumeItem.episode}`
                        : ""} ({formatTime(resumeItem.currentTime)})
                    </button>
                  )}
                  {detailData.media_type === "movie" ? (
                    <button
                      className={resumeItem ? "secondary" : "primary"}
                      onClick={() =>
                        openPlayer("movie", detailData.id, titleFor(detailData), undefined, undefined, 0)
                      }
                    >
                      Play movie
                    </button>
                  ) : (
                    <button
                      className={resumeItem ? "secondary" : "primary"}
                      onClick={() =>
                        openPlayer(
                          "tv",
                          detailData.id,
                          titleFor(detailData),
                          selectedSeason,
                          episodes[0]?.episode_number ?? 1,
                          0
                        )
                      }
                    >
                      Play latest episode
                    </button>
                  )}
                  <button className="secondary" onClick={() => setMode("home")}>
                    Back to home
                  </button>
                </div>

                {detailData.media_type === "tv" && (
                  <div className="panel" style={{ padding: "16px" }}>
                    <div className="section-title">
                      <h3>Seasons</h3>
                      <span>Select an episode</span>
                    </div>
                    <div className="list" style={{ marginBottom: "12px" }}>
                      {seasonList.map((season) => (
                        <div
                          key={season.id}
                          className="list-item"
                          onClick={() => setSelectedSeason(season.season_number)}
                        >
                          <strong>{season.name}</strong>
                          <span>{season.episode_count} episodes</span>
                        </div>
                      ))}
                    </div>
                    <div className="list">
                      {episodes.map((episode) => (
                        <div
                          key={episode.id}
                          className="list-item"
                          onClick={() =>
                            openPlayer(
                              "tv",
                              detailData.id,
                              `${titleFor(detailData)} · S${episode.season_number}E${episode.episode_number}`,
                              episode.season_number,
                              episode.episode_number,
                              0
                            )
                          }
                        >
                          <strong>
                            E{episode.episode_number} · {episode.name}
                          </strong>
                          <span>{episode.air_date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="hero fade-in">
              <div className="hero-card">
                <h2>Search fast, play instantly.</h2>
                <p>
                  Powered by TMDB metadata with an optimized ranking layer and iframe playback. Keep
                  your watch history synced locally.
                </p>
                <div className="search-bar">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search films or series"
                  />
                  <button onClick={() => setQuery((value) => value.trim())}>Search</button>
                </div>
                {searchHistory.length > 0 && (
                  <div className="action-row" style={{ gap: "8px" }}>
                    {searchHistory.slice(0, 5).map((item) => (
                      <button
                        key={item.query}
                        className="secondary"
                        onClick={() => setQuery(item.query)}
                      >
                        {item.query}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="hero-card" style={{ justifyContent: "space-between" }}>
                <div>
                  <span className="badge">Trending now</span>
                  <h2 style={{ marginTop: "12px" }}>{heroItem ? titleFor(heroItem) : "Loading"}</h2>
                  <p>{heroItem?.overview?.slice(0, 160) ?? "Fetching the latest highlights."}</p>
                </div>
                {heroItem && (
                  <button className="primary" onClick={() => openDetail(heroItem)}>
                    Open {trendingLabel}
                  </button>
                )}
              </div>
            </section>

            {query.trim().length >= 2 && (
              <section className="panel fade-in">
                <div className="section-title">
                  <h3>Search results</h3>
                  <span>{searchLoading ? "Searching..." : `${searchResults.length} matches`}</span>
                </div>
                {searchError && <p style={{ color: "var(--danger)" }}>{searchError}</p>}
                <div className="grid">
                  {searchResults.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="card stagger"
                      style={{ animationDelay: `${index * 0.03}s` }}
                      onClick={() => openDetail(item)}
                    >
                      <img src={imageUrl(item.poster_path)} alt={titleFor(item)} />
                      <div className="card-body">
                        <h4>{titleFor(item)}</h4>
                        <span>{dateFor(item).slice(0, 4) || ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {homeError && <p style={{ color: "var(--danger)" }}>{homeError}</p>}

            {activeTab === "home" && (
              <>
                <section className="panel fade-in">
                  <div className="section-title">
                    <h3>Trending picks</h3>
                    <span>Handy for quick picks</span>
                  </div>
                  <div className="grid">
                    {trending.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="card stagger"
                        style={{ animationDelay: `${index * 0.03}s` }}
                        onClick={() => openDetail(item)}
                      >
                        <img src={imageUrl(item.poster_path)} alt={titleFor(item)} />
                        <div className="card-body">
                          <h4>{titleFor(item)}</h4>
                          <span>{dateFor(item).slice(0, 4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel fade-in">
                  <div className="section-title">
                    <h3>Top rated movies</h3>
                    <span>Critically acclaimed films</span>
                  </div>
                  <div className="grid">
                    {topMovies.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="card stagger"
                        style={{ animationDelay: `${index * 0.03}s` }}
                        onClick={() => openDetail(item)}
                      >
                        <img src={imageUrl(item.poster_path)} alt={titleFor(item)} />
                        <div className="card-body">
                          <h4>{titleFor(item)}</h4>
                          <span>{dateFor(item).slice(0, 4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel fade-in">
                  <div className="section-title">
                    <h3>Top rated series</h3>
                    <span>Highest-scoring shows</span>
                  </div>
                  <div className="grid">
                    {topShows.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="card stagger"
                        style={{ animationDelay: `${index * 0.03}s` }}
                        onClick={() => openDetail(item)}
                      >
                        <img src={imageUrl(item.poster_path)} alt={titleFor(item)} />
                        <div className="card-body">
                          <h4>{titleFor(item)}</h4>
                          <span>{dateFor(item).slice(0, 4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === "library" && (
              <>
                <section className="panel fade-in">
                  <div className="section-title">
                    <h3>Continue watching</h3>
                    <span>Your recent progress</span>
                  </div>
                  {continueWatching.length === 0 ? (
                    <p>Start a film or episode to build your watch history.</p>
                  ) : (
                    <div className="grid">
                      {continueWatching.map((item, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="card stagger"
                          style={{ animationDelay: `${index * 0.03}s` }}
                          onClick={() =>
                            openPlayer(
                              item.media_type,
                              item.id,
                              item.title,
                              item.season,
                              item.episode,
                              item.currentTime,
                              item.poster_path
                            )
                          }
                        >
                          <img src={imageUrl(item.poster_path)} alt={item.title} />
                          <div className="card-body">
                            <h4>{item.title}</h4>
                            <span>
                              {item.media_type === "tv" && item.season
                                ? `S${item.season}E${item.episode} · `
                                : ""}
                              {Math.round(item.progress)}% · {formatTime(item.currentTime)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel fade-in">
                  <div className="section-title">
                    <h3>Recently opened</h3>
                    <span>Last viewed details</span>
                  </div>
                  {history.length === 0 ? (
                    <p>Open a film or series to see it here.</p>
                  ) : (
                    <div className="grid">
                      {history.map((item, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="card stagger"
                          style={{ animationDelay: `${index * 0.03}s` }}
                          onClick={() => openDetail(item)}
                        >
                          <img src={imageUrl(item.poster_path)} alt={item.title} />
                          <div className="card-body">
                            <h4>{item.title}</h4>
                            <span>{new Date(item.last_opened).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        Metadata provided by TMDB. Streaming embeds provided by your iframe provider.
      </footer>
    </div>
  );
}
