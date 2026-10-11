"use client";

import { useEffect, useState } from "react";
import { trackingStatus } from "@/lib/trackingStatus";

type Props = Omit<Parameters<typeof trackingStatus>[0], "now">;

/** Header chip: says "Live tracking" only while location is really reaching the office. */
export default function HeaderTrackingStatus(props: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const result = trackingStatus({ ...props, now });
  if (!result) return null;
  const dot = result.tone === "ok" ? "bg-md-green animate-pulse" : result.tone === "bad" ? "bg-md-red" : "bg-md-yellow";
  return (
    <div role="status" title={result.detail} className="mr-3 flex min-w-0 items-center gap-2 whitespace-nowrap text-sm opacity-90">
      <span aria-hidden="true" className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{result.label}</span>
    </div>
  );
}
