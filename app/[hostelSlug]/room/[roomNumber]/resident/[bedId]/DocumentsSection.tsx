"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type DocumentRow = {
  document_id: number;
  document_type: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_at: string;
};

const DOCUMENT_TYPES = [
  "Aadhaar Card",
  "PAN Card",
  "Passport",
  "Driving License",
  "Voter ID",
  "Agreement",
  "Photo",
  "Other",
];

const BUCKET = "resident-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DocumentsSection({
  residentId,
  initialDocuments,
}: {
  residentId: number;
  initialDocuments: DocumentRow[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!file) {
      setErrorMessage("Please choose a file to upload.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("File is larger than the 10 MB limit.");
      return;
    }

    try {
      setUploading(true);

      const storagePath = `${residentId}/${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const documentId = await callRpcClient<number>("add_resident_document", {
        p_resident_id: residentId,
        p_document_type: documentType,
        p_file_name: file.name,
        p_storage_path: storagePath,
        p_file_size_bytes: file.size,
        p_mime_type: file.type || null,
        p_notes: notes || null,
      });

      await logAuditEvent("document_uploaded", "resident_document", documentId, {
        resident_id: residentId,
        document_type: documentType,
        file_name: file.name,
      });

      setDocuments((prev) => [
        {
          document_id: documentId,
          document_type: documentType,
          file_name: file.name,
          storage_path: storagePath,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          notes: notes || null,
          uploaded_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      setFile(null);
      setNotes("");
      (event.target as HTMLFormElement).reset();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to upload document."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleView(doc: DocumentRow) {
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, 60);

      if (error || !data) {
        throw new Error(error?.message || "Unable to generate a link.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to open document."
      );
    }
  }

  async function handleDelete(doc: DocumentRow) {
    if (!window.confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) {
      return;
    }

    setErrorMessage("");
    setBusyId(doc.document_id);

    try {
      const storagePath = await callRpcClient<string>(
        "delete_resident_document",
        { p_document_id: doc.document_id }
      );

      const supabase = createClient();
      await supabase.storage.from(BUCKET).remove([storagePath]);

      await logAuditEvent(
        "document_deleted",
        "resident_document",
        doc.document_id,
        { resident_id: residentId, file_name: doc.file_name }
      );

      setDocuments((prev) =>
        prev.filter((d) => d.document_id !== doc.document_id)
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete document."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">Documents</h2>

      <form
        onSubmit={handleUpload}
        className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Document Type
          </span>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            File
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Notes (optional)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </form>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="mt-5">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.document_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="font-semibold">{doc.file_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {doc.document_type} · {formatFileSize(doc.file_size_bytes)}{" "}
                    · Uploaded {formatDate(doc.uploaded_at)}
                  </p>
                  {doc.notes && (
                    <p className="mt-1 text-sm text-slate-500">{doc.notes}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleView(doc)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc.document_id}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyId === doc.document_id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
