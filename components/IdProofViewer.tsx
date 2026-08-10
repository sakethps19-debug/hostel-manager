"use client";

import { useState } from "react";
import { getResidentFileSignedUrl } from "@/lib/supabase/residentFiles";

export default function IdProofViewer({
  front,
  back,
}: {
  front: { storagePath: string } | null;
  back: { storagePath: string } | null;
}) {
  const [errorMessage, setErrorMessage] = useState("");

  async function handleView(storagePath: string) {
    setErrorMessage("");

    try {
      const url = await getResidentFileSignedUrl(storagePath, 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to open document."
      );
    }
  }

  if (!front && !back) {
    return (
      <p className="text-sm text-slate-500">
        No ID proof image uploaded yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {front && (
          <button
            onClick={() => handleView(front.storagePath)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Front
          </button>
        )}

        {back && (
          <button
            onClick={() => handleView(back.storagePath)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Back
          </button>
        )}
      </div>

      {errorMessage && (
        <p className="mt-2 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
