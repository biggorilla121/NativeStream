# NativeStream

Fast desktop streaming hub built with Tauri + React + TMDB metadata.

## Quick start

1. Install dependencies

```bash
npm install
```

2. Run the web UI (useful for quick iteration)

```bash
npm run dev
```

3. Run the native app (requires Rust + Tauri CLI)

```bash
npm run tauri dev
```

## Build installers

```bash
npm run tauri build
```

Bundled installers land under `src-tauri/target/release/bundle/`.

## Environment

Copy `.env.example` to `.env` and set values.

- `VITE_TMDB_READ_TOKEN` (TMDB v4 read token)
- `VITE_PROVIDER_MOVIE_TEMPLATE`
- `VITE_PROVIDER_TV_TEMPLATE`

## Notes

- TMDB attribution is required in any release build.
- If the iframe provider uses a different URL format, update the provider templates.
