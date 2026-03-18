import {
  Detail,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { getStatus, startIndexing, stopIndexing, clearIndex } from "./api";
import { IndexStatus } from "./types";

export default function StatusCommand() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const s = await getStatus();
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not connect to backend. Is `memsearch serve` running?",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleReindex = async () => {
    try {
      await startIndexing();
      showToast({ style: Toast.Style.Success, title: "Indexing started" });
      fetchStatus();
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to start indexing",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleStop = async () => {
    try {
      await stopIndexing();
      showToast({ style: Toast.Style.Success, title: "Indexing stopping..." });
      fetchStatus();
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to stop",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleClear = async () => {
    try {
      await clearIndex();
      showToast({ style: Toast.Style.Success, title: "Index cleared" });
      fetchStatus();
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to clear",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  let markdown: string;

  if (error) {
    markdown = `# MemSearch Status\n\n**Error:** ${error}\n\nMake sure the backend is running:\n\`\`\`bash\ncd backend && memsearch serve\n\`\`\``;
  } else if (!status) {
    markdown = "# MemSearch Status\n\nLoading...";
  } else {
    const lastIndexed = status.last_indexed_at
      ? new Date(status.last_indexed_at * 1000).toLocaleString()
      : "Never";

    const modalityLines = Object.entries(status.modalities)
      .sort(([, a], [, b]) => b - a)
      .map(([mod, count]) => `| ${mod} | ${count} |`)
      .join("\n");

    markdown = `# MemSearch Status

| Metric | Value |
|--------|-------|
| **Total indexed** | ${status.total} |
| **Last indexed** | ${lastIndexed} |
| **Currently indexing** | ${status.is_indexing ? "Yes" : "No"} |
${status.is_indexing ? `| **Progress** | ${status.indexed_count} files |` : ""}
${status.is_indexing && status.current_file ? `| **Current file** | ${status.current_file.split("/").pop()} |` : ""}

## Files by Type

| Type | Count |
|------|-------|
${modalityLines || "| — | No files indexed |"}
`;
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={fetchStatus}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          {status?.is_indexing ? (
            <Action
              title="Stop Indexing"
              icon={Icon.Stop}
              onAction={handleStop}
            />
          ) : (
            <Action
              title="Reindex All"
              icon={Icon.ArrowClockwise}
              onAction={handleReindex}
            />
          )}
          <Action
            title="Clear Index"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={handleClear}
            shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
          />
        </ActionPanel>
      }
    />
  );
}
