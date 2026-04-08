import { useState } from 'react'
import { Image, FileText, File, Copy, FolderOpen, ExternalLink } from 'lucide-react'
import { getThumbnailUrl } from '../api'
import type { SearchResult } from '../types'

function isPhotosAsset(filePath: string): boolean {
  return filePath.startsWith('photos://')
}

function getPhotosId(filePath: string): string {
  return filePath.replace('photos://', '')
}

function getModalityIcon(modality: string): JSX.Element {
  const cls = 'w-8 h-8 text-muted-foreground'
  switch (modality) {
    case 'image':
      return <Image className={cls} />
    case 'pdf':
      return <FileText className={cls} />
    case 'text':
      return <File className={cls} />
    default:
      return <File className={cls} />
  }
}

interface ResultCardProps {
  result: SearchResult
}

export function ResultCard({ result }: ResultCardProps): JSX.Element {
  const [imgError, setImgError] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }

  const handleAction = async (action: string): Promise<void> => {
    setShowMenu(false)
    switch (action) {
      case 'open':
        if (isPhotosAsset(result.file_path)) {
          await window.api.openInPhotos(getPhotosId(result.file_path))
        } else {
          await window.api.openFile(result.file_path)
        }
        break
      case 'finder':
        await window.api.showInFinder(result.file_path)
        break
      case 'copy-path':
        await window.api.copyToClipboard(result.file_path)
        break
      case 'copy-summary':
        if (result.text_summary) {
          await window.api.copyToClipboard(result.text_summary)
        }
        break
    }
  }

  const handleClick = (): void => {
    if (isPhotosAsset(result.file_path)) {
      window.api.openInPhotos(getPhotosId(result.file_path))
    } else {
      window.api.openFile(result.file_path)
    }
  }

  const scorePct = Math.round(result.score * 100)

  return (
    <>
      <div
        className="group relative rounded-lg overflow-hidden border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Thumbnail */}
        <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {result.thumbnail_filename && !imgError ? (
            <img
              src={getThumbnailUrl(result.thumbnail_filename)}
              alt={result.filename}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            getModalityIcon(result.modality)
          )}
        </div>

        {/* Info */}
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium truncate text-card-foreground">
            {result.filename}
          </p>
          {result.person_names && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {result.person_names.split(',').map((name) => (
                <span
                  key={name}
                  className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full truncate max-w-[100px]"
                >
                  {name.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score badge */}
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
          {scorePct}%
        </div>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent flex items-center gap-2"
              onClick={() => handleAction('open')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {isPhotosAsset(result.file_path) ? 'Open in Photos' : 'Open File'}
            </button>
            {!isPhotosAsset(result.file_path) && (
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent flex items-center gap-2"
                onClick={() => handleAction('finder')}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Show in Finder
              </button>
            )}
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent flex items-center gap-2"
              onClick={() => handleAction('copy-path')}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Path
            </button>
            {result.text_summary && (
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent flex items-center gap-2"
                onClick={() => handleAction('copy-summary')}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Summary
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
