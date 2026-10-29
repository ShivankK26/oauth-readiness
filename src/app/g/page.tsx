"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GuideView } from "@/components/GuideView";
import { decodeGuide } from "@/lib/format";
import type { Guide } from "@/lib/schema";

// Shared view for live-generated guides: the guide travels compressed in the URL fragment.
export default function SharedGuide() {
  const [guide, setGuide] = useState<Guide | null | undefined>(undefined);
  useEffect(() => setGuide(decodeGuide(window.location.hash.slice(1))), []);
  if (guide === undefined) return null;
  if (!guide)
    return (
      <p className="text-zinc-600">
        This share link is invalid or truncated. <Link href="/generate" className="underline">Generate a new guide</Link>.
      </p>
    );
  return <GuideView guide={guide} />;
}
