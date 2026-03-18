import {
  Grid,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  getPreferenceValues,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { exec } from "child_process";
import { search as searchApi, getThumbnailUrl } from "./api";
import { SearchResult } from "./types";

function isPhotosAsset(filePath: string): boolean {
  return filePath.startsWith("photos://");
}

function getPhotosId(filePath: string): string {
  return filePath.replace("photos://", "");
}

function openInPhotos(localIdentifier: string) {
  const script = `tell application "Photos"
  activate
  set theItem to media item id "${localIdentifier}"
  spotlight theItem
end tell`;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err) => {
    if (err) {
      showToast({ style: Toast.Style.Failure, title: "Failed to open in Photos", message: err.message });
    }
  });
}

const MODALITY_OPTIONS = [
  { id: "all", name: "All Types" },
  { id: "image", name: "Images" },
  { id: "pdf", name: "PDFs" },
  { id: "text", name: "Text Files" },
];

export default function SearchCommand() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [modality, setModality] = useState("all");
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      setQueryTime(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const mod = modality === "all" ? undefined : modality;
        const res = await searchApi(searchText, 20, mod);
        setResults(res.results);
        setQueryTime(res.query_time_ms);
      } catch (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Search Failed",
          message: error instanceof Error ? error.message : "Could not connect to backend. Is `memsearch serve` running?",
        });
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, modality]);

  return (
    <Grid
      columns={5}
      aspectRatio="4/3"
      fit={Grid.Fit.Fill}
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search your files..."
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Filter by type"
          onChange={setModality}
          defaultValue="all"
        >
          {MODALITY_OPTIONS.map((opt) => (
            <Grid.Dropdown.Item key={opt.id} title={opt.name} value={opt.id} />
          ))}
        </Grid.Dropdown>
      }
    >
      {!searchText.trim() ? (
        <Grid.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search Your Memory"
          description="Type a natural language query to search your indexed files"
        />
      ) : results.length === 0 && !isLoading ? (
        <Grid.EmptyView
          icon={Icon.XMarkCircle}
          title="No Results"
          description={`No matches for "${searchText}"`}
        />
      ) : (
        results.map((result, index) => (
          <Grid.Item
            key={result.file_path}
            content={{
              source: result.thumbnail_filename
                ? getThumbnailUrl(result.thumbnail_filename)
                : getModalityIcon(result.modality),
            }}
            title={result.filename}
            subtitle={`${(result.score * 100).toFixed(0)}%`}
            actions={
              <ActionPanel>
                {isPhotosAsset(result.file_path) ? (
                  <Action
                    title="Open in Photos"
                    icon={Icon.Image}
                    onAction={() => openInPhotos(getPhotosId(result.file_path))}
                  />
                ) : (
                  <>
                    <Action.Open title="Open File" target={result.file_path} />
                    <Action.ShowInFinder path={result.file_path} />
                  </>
                )}
                <Action.CopyToClipboard
                  title="Copy Path"
                  content={result.file_path}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
                {result.text_summary && (
                  <Action.CopyToClipboard
                    title="Copy Summary"
                    content={result.text_summary}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
                  />
                )}
              </ActionPanel>
            }
          />
        ))
      )}
    </Grid>
  );
}

function getModalityIcon(modality: string): string {
  switch (modality) {
    case "image":
      return Icon.Image;
    case "pdf":
      return Icon.Document;
    case "text":
      return Icon.Text;
    default:
      return Icon.Finder;
  }
}
