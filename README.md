# MemSearch

AI-powered semantic search for your Mac. Index local files and iCloud Photos, then search them with natural language using Google Gemini embeddings and ChromaDB.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)

## Features

- **Semantic search** -- find files by meaning, not just filenames
- **Indexes local files** -- text files, PDFs, images (including HEIC) from any folder
- **Indexes iCloud Photos** -- connects directly to your Photos library via PhotoKit
- **People search** -- search photos by person using Apple Photos face recognition (`@name` syntax)
- **Auto-indexing** -- watches folders for changes and re-indexes automatically
- **Desktop app** -- native macOS Electron app with onboarding wizard
- **Raycast extension** -- search your files from anywhere with a keystroke
- **CLI** -- full command-line interface for power users

## Architecture

```
                                         HTTP
┌──────────────────────┐   ┌──────────────────────────────────┐
│  Electron Desktop    │──►│  FastAPI Backend (:7242)          │
│  (search + status)   │   │                                  │
├──────────────────────┤   │  ┌─ Gemini Embeddings            │
│  Raycast Extension   │──►│  ├─ ChromaDB Vector Store        │
│  (search UI)         │   │  ├─ File Processors              │
├──────────────────────┤   │  │  (text, image, PDF)           │
│  CLI                 │──►│  ├─ PhotoKit (iCloud Photos)     │
│  (memsearch ...)     │   │  ├─ People DB (face recognition) │
└──────────────────────┘   │  └─ File Watcher (auto-index)    │
                           └──────────────────────────────────┘
```

## Quick Start (Desktop App)

Download the latest `.dmg` from the [Releases](../../releases) page, open it, and drag MemSearch to your Applications folder.

### macOS: first launch

MemSearch isn't notarized with Apple yet, so macOS may show a "MemSearch is damaged and can't be opened" message when you try to open it. Run this in Terminal once to clear the quarantine attribute:

```bash
xattr -cr /Applications/MemSearch.app
```

Then open the app normally.

On first launch the app will:
1. Ask for your [Google Gemini API key](https://aistudio.google.com/apikey) (free tier works)
2. Let you pick folders to index
3. Optionally enable iCloud Photos indexing
4. Start the backend automatically

## Requirements

- **macOS** (required for PhotoKit / iCloud Photos integration)
- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** (Python package manager)
- A [Google Gemini API key](https://aistudio.google.com/apikey)

For the Raycast extension: [Raycast](https://raycast.com)

## Setup (from source)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your Gemini API key
```

Install dependencies and run:

```bash
uv sync
uv run memsearch serve
```

The server starts on `http://localhost:7242`.

### 2. Desktop App (Electron)

```bash
cd electron
npm install
npm run dev
```

To build a distributable `.dmg`:

```bash
npm run package
```

### 3. Raycast Extension

```bash
cd raycast-extension
npm install
npm run dev
```

This opens the extension in Raycast for development. Use "Memory Search" or "Index Status" commands.

## Usage

### Desktop App

The desktop app manages the backend automatically. Use the **Search** tab to query your indexed files and the **Status** tab to manage indexing, configure folders, and check stats.

### CLI

```bash
# Index a folder
uv run memsearch index ~/Documents

# Index iCloud Photos
uv run memsearch index-photos
uv run memsearch index-photos --limit 100 --favorites

# Search
uv run memsearch search "notes about machine learning"
uv run memsearch search "family vacation photos" -m image

# Search by person (uses Apple Photos face recognition)
uv run memsearch search "@samuel vacation"

# Check status
uv run memsearch status

# Start the API server
uv run memsearch serve
```

### Raycast

Once the backend is running (`memsearch serve`), open Raycast and use:

- **Memory Search** -- type a natural language query
- **Index Status** -- view stats, trigger reindexing, or clear the index

### API

The backend exposes a REST API on port 7242:

| Endpoint | Method | Description |
|---|---|---|
| `/search` | POST | Search with query, n_results, modality filter |
| `/status` | GET | Index statistics |
| `/index/start` | POST | Start indexing folders |
| `/index/photos` | POST | Start indexing iCloud Photos |
| `/index/stop` | POST | Cancel ongoing indexing |
| `/people` | GET | List recognized people from Photos |
| `/people/refresh` | POST | Refresh face recognition data |
| `/config` | GET/PUT | View or update configuration |
| `/index` | DELETE | Clear all indexed data |
| `/thumbnails/{filename}` | GET | Retrieve cached thumbnail |

## Supported File Types

| Category | Formats |
|---|---|
| Images | HEIC, JPEG, PNG, GIF, WebP, TIFF, BMP |
| Documents | PDF (text extraction + first page rendering) |
| Text | `.txt`, `.md`, `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.toml`, `.csv`, and more |

## Configuration

All settings use the `MEMSEARCH_` prefix and can be set in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Google Gemini API key |
| `PORT` | `7242` | Server port |
| `HOST` | `127.0.0.1` | Server host |
| `CHROMA_DIR` | `~/Library/Application Support/MacMemorySearch/chroma` | ChromaDB storage path |
| `THUMBNAIL_DIR` | `~/Library/Application Support/MacMemorySearch/thumbnails` | Thumbnail cache path |
| `EMBEDDING_MODEL` | `gemini-embedding-2-preview` | Gemini embedding model |
| `EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimensions |
| `MAX_FILE_SIZE_MB` | `50` | Maximum file size to index |
| `MAX_CONCURRENT_EMBEDS` | `5` | Concurrent embedding requests |

## Project Structure

```
memsearch/
├── backend/           Python FastAPI backend
│   └── src/
│       ├── embedding/   Gemini embedding client
│       ├── indexer/     File processing, photo indexing, people DB, file watcher
│       ├── storage/     ChromaDB vector store
│       └── server.py    REST API
├── electron/          macOS desktop app (Electron + React + Tailwind)
│   └── src/
│       ├── main/        Electron main process, backend lifecycle
│       ├── preload/     IPC bridge
│       └── renderer/    React UI (search, status, onboarding)
└── raycast-extension/ Raycast search integration
```

## License

MIT
