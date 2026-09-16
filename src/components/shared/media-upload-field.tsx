"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Paperclip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from "@/lib/storage/upload-media"
import { cn } from "@/lib/utils"

/** Storage bucket the automation + flow "send message" forms upload to. */
export const SHARED_MEDIA_BUCKET = "flow-media";

interface MediaUploadFieldProps {
  bucket?: string;
  /** Current uploaded file to show as a chip (or null to show the picker). */
  file?: { url?: string; filename?: string } | null;
  /** Called with the public URL + original filename after a successful upload. */
  onDone: (publicUrl: string, filename: string) => void;
  /** Clear the attached file (caller drops the stored URL). */
  onClear: () => void;
  /** MIME accept list for the hidden picker (defaults to WhatsApp video types). */
  accept?: string;
  /** Byte ceiling enforced before upload (defaults to Meta's video cap). */
  maxBytes?: number;
  /** Picker button label. */
  label: string;
  /** Small helper line under the control. */
  hint?: string;
  className?: string;
}

export function MediaUploadField({
  bucket = SHARED_MEDIA_BUCKET,
  file,
  onDone,
  onClear,
  accept = "video/mp4,video/3gpp",
  maxBytes = 16 * 1024 * 1024,
  label,
  hint,
  className,
}: MediaUploadFieldProps) {
  const t = useTranslations("MediaUpload")
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    if (f.size > maxBytes) {
      toast.error(t("tooLarge", { limit: Math.round(maxBytes / (1024 * 1024)) }))
      return
    }
    setUploading(true)
    try {
      const { publicUrl } = await uploadAccountMedia(bucket, f)
      onDone(publicUrl, f.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
      {file?.url ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.filename ?? "attachment"}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear} aria-label={t("remove")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="mr-2 h-4 w-4" />
          )}
          {uploading ? t("uploading") : label}
        </Button>
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// ============================================================
// Image/video attachment field — used by the automation "send
// message" step and the flow "send_message" node. Pairs a media
// kind selector (image | video) with MediaUploadField and re-emits
// the chosen kind so callers can persist `{ type, url, filename }`.
// ============================================================

/** Kinds the Automation / Flow send-message forms offer. */
export const SEND_MEDIA_KINDS = ["image", "video"] as const;
export type SendMediaKind = (typeof SEND_MEDIA_KINDS)[number];

/** MIME accept lists mirroring the `flow-media` bucket policy (migration 016). */
export const SEND_MEDIA_ACCEPT: Record<SendMediaKind, string> = {
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/3gpp",
};

interface MediaSendFieldProps {
  /** Currently attached media (or null to show the picker). */
  file?: { type?: string; url?: string; filename?: string } | null;
  /** Called with the chosen kind + public URL + original filename. */
  onDone: (kind: SendMediaKind, publicUrl: string, filename: string) => void;
  /** Clear the attached media entirely. */
  onClear: () => void;
  bucket?: string;
  className?: string;
}

export function MediaSendField({
  file,
  onDone,
  onClear,
  bucket,
  className,
}: MediaSendFieldProps) {
  const t = useTranslations("MediaSend")
  const [kind, setKind] = useState<SendMediaKind>(
    file?.type === "image" ? "image" : "video",
  )

  return (
    <div className={cn("space-y-2", className)}>
      <Select
        value={kind}
        onValueChange={(v) => {
          const next = v === "image" ? "image" : "video";
          setKind(next)
          // A stored file was uploaded for the old kind — dropping it
          // here keeps `type` and the actual bytes in sync.
          if (file?.url) onClear()
        }}
      >
        <SelectTrigger className="bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="image">{t("image")}</SelectItem>
          <SelectItem value="video">{t("video")}</SelectItem>
        </SelectContent>
      </Select>
      <MediaUploadField
        bucket={bucket}
        file={file}
        onDone={(url, filename) => onDone(kind, url, filename)}
        onClear={onClear}
        accept={SEND_MEDIA_ACCEPT[kind]}
        maxBytes={MEDIA_MAX_BYTES_BY_KIND[kind]}
        label={kind === "image" ? t("attachImage") : t("attachVideo")}
        hint={t("hint")}
      />
    </div>
  )
}