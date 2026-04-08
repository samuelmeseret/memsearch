import type { SearchResponse, IndexStatus, AppConfig, PersonInfo } from './types'

const BASE_URL = 'http://127.0.0.1:7242'

export async function search(
  query: string,
  nResults: number = 20,
  modality?: string
): Promise<SearchResponse> {
  const res = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      n_results: nResults,
      modality: modality || null
    })
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
    } catch { /* ignore parse errors */ }
    throw new Error(detail)
  }
  return (await res.json()) as SearchResponse
}

export async function getStatus(): Promise<IndexStatus> {
  const res = await fetch(`${BASE_URL}/status`)
  if (!res.ok) throw new Error(`Status failed: ${res.statusText}`)
  const data = await res.json()
  return {
    total: data.total ?? 0,
    modalities: data.modalities ?? {},
    last_indexed_at: data.last_indexed_at ?? null,
    is_indexing: data.is_indexing ?? false,
    indexed_count: data.indexed_count ?? 0,
    error_count: data.error_count ?? 0,
    current_file: data.current_file ?? '',
    total_files_found: data.total_files_found ?? 0,
    errors: data.errors ?? [],
    folder_progress: data.folder_progress ?? {},
    start_time: data.start_time ?? null,
  }
}

export async function startIndexing(folders?: string[], limit?: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/index/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folders, limit })
  })
  if (!res.ok) throw new Error(`Start indexing failed: ${res.statusText}`)
}

export async function startPhotosIndexing(
  limit?: number,
  favoritesOnly?: boolean
): Promise<void> {
  const res = await fetch(`${BASE_URL}/index/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, favorites_only: favoritesOnly || false })
  })
  if (!res.ok) throw new Error(`Photos indexing failed: ${res.statusText}`)
}

export async function stopIndexing(): Promise<void> {
  const res = await fetch(`${BASE_URL}/index/stop`, { method: 'POST' })
  if (!res.ok) throw new Error(`Stop indexing failed: ${res.statusText}`)
}

export async function clearIndex(): Promise<void> {
  const res = await fetch(`${BASE_URL}/index`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Clear failed: ${res.statusText}`)
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${BASE_URL}/config`)
  if (!res.ok) throw new Error(`Config failed: ${res.statusText}`)
  return (await res.json()) as AppConfig
}

export async function updateConfig(update: {
  watched_folders?: string[]
  max_file_size_mb?: number
  auto_index_enabled?: boolean
  index_photos_enabled?: boolean
}): Promise<void> {
  const res = await fetch(`${BASE_URL}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  })
  if (!res.ok) throw new Error(`Update config failed: ${res.statusText}`)
}

export async function getPeople(): Promise<PersonInfo[]> {
  const res = await fetch(`${BASE_URL}/people`)
  if (!res.ok) throw new Error(`People failed: ${res.statusText}`)
  const data = await res.json()
  return data.people as PersonInfo[]
}

export async function refreshPeople(): Promise<{
  people_count: number
  photos_updated: number
}> {
  const res = await fetch(`${BASE_URL}/people/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error(`Refresh failed: ${res.statusText}`)
  return await res.json()
}

export function getThumbnailUrl(thumbnailFilename: string): string {
  return `${BASE_URL}/thumbnails/${thumbnailFilename}`
}
