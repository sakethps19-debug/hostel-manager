"use client";

import { useState } from "react";

export default function CopyTextButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (older browsers, insecure context) -
      // there's nothing more useful to do than let the user copy manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ||
        "rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      }
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
