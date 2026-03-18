export interface SearchResult {
  file_path: string;
  score: number;
  modality: string;
  filename: string;
  thumbnail_filename: string | null;
  text_summary: string;
  file_size: number;
  indexed_at: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query_time_ms: number;
  total_indexed: number;
}

export interface IndexStatus {
  total: number;
  modalities: Record<string, number>;
  last_indexed_at: number | null;
  is_indexing: boolean;
  indexed_count: number;
  error_count: number;
  current_file: string;
}
