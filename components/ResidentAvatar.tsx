"use client";

import { useEffect, useState } from "react";
import { getResidentFileSignedUrl } from "@/lib/supabase/residentFiles";

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ResidentAvatar({
  photoStoragePath,
  fullName,
  size = 36,
}: {
  photoStoragePath: string | null;
  fullName: string;
  size?: number;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!photoStoragePath) {
      return;
    }

    getResidentFileSignedUrl(photoStoragePath, 300)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSignedUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [photoStoragePath]);

  const displayUrl = photoStoragePath ? signedUrl : null;

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-400"
      style={{ width: size, height: size }}
    >
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={fullName}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(fullName)
      )}
    </div>
  );
}
