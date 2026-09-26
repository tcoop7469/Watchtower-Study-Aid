import React, { useState, useRef, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  Upload, 
  Link as LinkIcon, 
  Trash2, 
  RefreshCw, 
  Maximize2, 
  X, 
  AlertCircle,
  Loader2,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AdditionalNote } from '../types';
import { 
  processImageFile, 
  extractImageFromClipboard, 
  extractImageFromDrag 
} from '../utils/imageUtils';

interface ImageReferenceNoteProps {
  note: AdditionalNote;
  onUpdate: (content: string, caption?: string) => void;
  onRemove: () => void;
}

export const ImageReferenceNote: React.FC<ImageReferenceNoteProps> = ({
  note,
  onUpdate,
  onRemove
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [captionValue, setCaptionValue] = useState(note.caption || '');
  const [isEditingCaption, setIsEditingCaption] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasImage = Boolean(note.content && note.content.trim().length > 0);

  // Automatically clear error state whenever note content changes
  useEffect(() => {
    setImageError(false);
  }, [note.content]);

  useEffect(() => {
    setCaptionValue(note.caption || '');
  }, [note.caption]);

  // Handle uploading and compressing a File object
  const handleFileProcess = async (file: File) => {
    setIsLoading(true);
    setImageError(false);
    try {
      const optimizedBase64 = await processImageFile(file);
      onUpdate(optimizedBase64, captionValue);
    } catch (err) {
      console.error('Failed to process image file:', err);
      setImageError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle URL submission
  const handleLoadUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = urlInputValue.trim();
    if (!trimmed) return;
    
    setIsLoading(true);
    setImageError(false);
    onUpdate(trimmed, captionValue);
    setShowUrlInput(false);
    setUrlInputValue('');
    setIsLoading(false);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const extracted = await extractImageFromDrag(e.dataTransfer);
    if (extracted?.file) {
      handleFileProcess(extracted.file);
    } else if (extracted?.url) {
      setImageError(false);
      onUpdate(extracted.url, captionValue);
    }
  };

  // Clipboard paste handler
  const handlePaste = async (e: React.ClipboardEvent) => {
    const extracted = await extractImageFromClipboard(e.clipboardData);
    if (extracted?.file) {
      e.preventDefault();
      handleFileProcess(extracted.file);
    } else if (extracted?.url) {
      e.preventDefault();
      setImageError(false);
      onUpdate(extracted.url, captionValue);
    }
  };

  // File input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    // Reset file input value so selecting the same file again triggers change
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleClearImage = () => {
    setImageError(false);
    onUpdate('', captionValue);
  };

  const handleSaveCaption = () => {
    setIsEditingCaption(false);
    onUpdate(note.content, captionValue);
  };

  return (
    <div className="space-y-2">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Main Image Container */}
      {!hasImage ? (
        <div
          ref={containerRef}
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={cn(
            "relative rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3 transition-all outline-none text-center cursor-pointer select-none",
            isDragging
              ? "border-primary bg-primary/10 scale-[1.01]"
              : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/40"
          )}
          onClick={(e) => {
            // Only trigger file picker if not clicking the URL button/input
            if ((e.target as HTMLElement).closest('.prevent-file-trigger')) return;
            fileInputRef.current?.click();
          }}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Optimizing and attaching image...</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <ImageIcon size={24} />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Click to choose a picture or drop it here
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports JPG, PNG, WebP, GIF, SVG, and clipboard paste (<kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono border">Ctrl+V</kbd>)
                </p>
              </div>

              {/* Action buttons inside empty state */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 prevent-file-trigger">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs font-medium gap-1.5 shadow-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={13} />
                  Browse Device
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium gap-1.5 border-dashed"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                >
                  <LinkIcon size={13} />
                  {showUrlInput ? "Hide Link Input" : "Add Image from Web Link"}
                </Button>
              </div>

              {/* Optional Web URL Input */}
              {showUrlInput && (
                <div 
                  className="w-full max-w-md pt-2 prevent-file-trigger"
                  onClick={(e) => e.stopPropagation()}
                >
                  <form onSubmit={handleLoadUrl} className="flex gap-1.5">
                    <Input
                      type="url"
                      placeholder="Paste image URL (e.g. from JW.org)..."
                      value={urlInputValue}
                      onChange={(e) => setUrlInputValue(e.target.value)}
                      className="h-8 text-xs bg-background"
                      autoFocus
                    />
                    <Button 
                      type="submit" 
                      size="sm" 
                      className="h-8 text-xs px-3 font-semibold"
                      disabled={!urlInputValue.trim()}
                    >
                      Load
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Image Display State */
        <div className="space-y-2">
          <div 
            className="relative rounded-xl border border-border bg-black/5 dark:bg-black/20 overflow-hidden group shadow-sm flex flex-col items-center justify-center min-h-[160px] max-h-[450px]"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
          >
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-xs font-medium text-muted-foreground">Updating picture...</p>
              </div>
            )}
            {imageError ? (
              <div className="p-6 text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-rose-500/10 text-rose-500">
                  <AlertCircle size={28} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Image could not be displayed
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    The image link might be private, blocked, or expired. You can upload it from your device or paste a different link.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={12} className="mr-1" />
                    Upload from Device
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleClearImage}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <img
                  src={note.content}
                  alt={note.caption || "Study reference illustration"}
                  className="w-full max-h-[450px] object-contain cursor-zoom-in"
                  onLoad={() => setImageError(false)}
                  onError={() => setImageError(true)}
                  onClick={() => setIsLightboxOpen(true)}
                />

                {/* Floating Top Controls Overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity bg-background/85 dark:bg-background/90 backdrop-blur-md p-1 rounded-lg border border-border/60 shadow-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-foreground/80 hover:text-foreground hover:bg-muted"
                    onClick={() => setIsLightboxOpen(true)}
                    title="Enlarge illustration"
                  >
                    <Maximize2 size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-foreground/80 hover:text-foreground hover:bg-muted"
                    onClick={() => fileInputRef.current?.click()}
                    title="Replace picture"
                  >
                    <RefreshCw size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-destructive hover:bg-destructive/10"
                    onClick={handleClearImage}
                    title="Remove picture"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Optional Caption / Label Row */}
          <div className="flex items-center justify-between text-xs px-1">
            {isEditingCaption ? (
              <div className="flex items-center gap-1.5 w-full">
                <Input
                  type="text"
                  placeholder="Add a caption or note about this picture..."
                  value={captionValue}
                  onChange={(e) => setCaptionValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCaption();
                    if (e.key === 'Escape') setIsEditingCaption(false);
                  }}
                  className="h-7 text-xs bg-background"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-semibold gap-1"
                  onClick={handleSaveCaption}
                >
                  <Check size={12} />
                  Save
                </Button>
              </div>
            ) : (
              <div 
                className="flex items-center justify-between w-full group/caption cursor-pointer"
                onClick={() => setIsEditingCaption(true)}
              >
                <p className="text-[11px] text-muted-foreground italic truncate">
                  {captionValue || "Click to add a caption or description for this picture..."}
                </p>
                <span className="text-[10px] text-primary font-medium opacity-0 group-hover/caption:opacity-100 transition-opacity">
                  Edit
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div 
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -top-10 right-0 h-8 w-8 rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md"
              onClick={() => setIsLightboxOpen(false)}
            >
              <X size={16} />
            </Button>
            <img
              src={note.content}
              alt={note.caption || "Enlarged illustration"}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
              referrerPolicy="no-referrer"
            />
            {captionValue && (
              <p className="mt-3 text-sm text-white/90 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md text-center">
                {captionValue}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
