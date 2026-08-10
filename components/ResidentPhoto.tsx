"use client";

import { useEffect, useRef, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import {
  buildResidentFilePath,
  getResidentFileSignedUrl,
  removeResidentFile,
  uploadResidentFile,
} from "@/lib/supabase/residentFiles";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ResidentPhoto({
  residentId,
  fullName,
  photo,
}: {
  residentId: number;
  fullName: string;
  photo: { documentId: number; storagePath: string } | null;
}) {
  const [currentPhoto, setCurrentPhoto] = useState(photo);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentPhoto) {
      setSignedUrl(null);
      return;
    }

    getResidentFileSignedUrl(currentPhoto.storagePath, 3600)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSignedUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPhoto]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setErrorMessage("");

    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMessage("Please choose a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setErrorMessage("Photo is larger than the 5 MB limit.");
      return;
    }

    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleCancelPreview() {
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConfirm() {
    if (!pendingFile) return;

    setErrorMessage("");
    setSaving(true);

    try {
      const path = buildResidentFilePath(residentId, "profile", pendingFile.name);
      await uploadResidentFile(path, pendingFile);

      const documentId = await callRpcClient<number>("add_resident_document", {
        p_resident_id: residentId,
        p_document_type: "Resident Photo",
        p_document_subtype: null,
        p_file_name: pendingFile.name,
        p_storage_path: path,
        p_file_size_bytes: pendingFile.size,
        p_mime_type: pendingFile.type,
        p_notes: null,
        p_is_primary: true,
      });

      await logAuditEvent("resident_photo_updated", "resident", residentId, {
        file_name: pendingFile.name,
      });

      setCurrentPhoto({ documentId, storagePath: path });
      handleCancelPreview();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save photo."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!currentPhoto) return;
    if (!window.confirm("Remove the resident photo?")) return;

    setErrorMessage("");
    setSaving(true);

    try {
      await callRpcClient("delete_resident_document", {
        p_document_id: currentPhoto.documentId,
      });
      await removeResidentFile(currentPhoto.storagePath);
      await logAuditEvent("resident_photo_removed", "resident", residentId, {});

      setCurrentPhoto(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove photo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <div className="relative h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Preview"
            className="h-full w-full object-cover"
          />
        ) : signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt={fullName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-400">
            {getInitials(fullName)}
          </div>
        )}
      </div>

      {previewUrl ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={handleCancelPreview}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {currentPhoto ? "Change Photo" : "Add Photo"}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {currentPhoto && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="rounded-lg border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="max-w-[12rem] text-center text-xs font-medium text-red-600 sm:text-left">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
