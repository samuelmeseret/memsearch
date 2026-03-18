import { getPreferenceValues } from "@raycast/api";
import { SearchResponse, IndexStatus } from "./types";

function getBaseUrl(): string {
  const { backendUrl } = getPreferenceValues<{ backendUrl: string }>();
  return backendUrl || "http://localhost:7242";
}

export async function search(
  query: string,
  nResults: number = 20,
  modality?: string,
): Promise<SearchResponse> {
  const res = await fetch(`${getBaseUrl()}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      n_results: nResults,
      modality: modality || null,
    }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return (await res.json()) as SearchResponse;
}

export async function getStatus(): Promise<IndexStatus> {
  const res = await fetch(`${getBaseUrl()}/status`);
  if (!res.ok) throw new Error(`Status failed: ${res.statusText}`);
  return (await res.json()) as IndexStatus;
}

export async function startIndexing(folders?: string[], limit?: number): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/index/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folders, limit }),
  });
  if (!res.ok) throw new Error(`Start indexing failed: ${res.statusText}`);
}

export async function stopIndexing(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/index/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`Stop indexing failed: ${res.statusText}`);
}

export async function clearIndex(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/index`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Clear failed: ${res.statusText}`);
}

export function getThumbnailUrl(thumbnailFilename: string): string {
  return `${getBaseUrl()}/thumbnails/${thumbnailFilename}`;
}
