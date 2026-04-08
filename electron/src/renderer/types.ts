export interface SearchResult {
  file_path: string
  score: number
  modality: string
  filename: string
  thumbnail_filename: string | null
  text_summary: string
  file_size: number
  indexed_at: number
  person_names: string
}

export interface PersonInfo {
  name: string
  face_count: number
}

export interface SearchResponse {
  results: SearchResult[]
  query_time_ms: number
  total_indexed: number
}

export interface IndexStatus {
  total: number
  modalities: Record<string, number>
  last_indexed_at: number | null
  is_indexing: boolean
  indexed_count: number
  error_count: number
  current_file: string
  total_files_found: number
  errors: Array<{ file_path: string; error: string }>
  folder_progress: Record<string, { total: number; indexed: number; errors: number }>
  start_time: number | null
}

export interface AppConfig {
  watched_folders: string[]
  max_file_size_mb: number
  auto_index_enabled: boolean
  index_photos_enabled: boolean
  embedding_model: string
  embedding_dimensions: number
  port: number
}
