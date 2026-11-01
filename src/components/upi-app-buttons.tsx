"use client";

import { useEffect, useState } from "react";
import { UPI_APPS } from "@/lib/upi";

/**
 * Opens the shopper's installed UPI apps with the payment pre-filled.
 * Android routes "upi://pay" to a chooser of every UPI app; iPhone needs each app's own scheme.
 */
export function UpiAppButtons({ query, label }: { query: string; label: string }) {
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));
  }, []);
  const generic = `upi://pay?${query}`;

  return (
    <div className="space-y-3">
      {!ios && (
        <a href={generic} className="btn-saffron w-full py-3 text-base">
          {label}
        </a>
      )}
      <div>
        <p className="mb-2 text-xs text-muted">{ios ? "Choose your UPI app:" : "Or open a specific app:"}</p>
        <div className="grid grid-cols-3 gap-2">
          {UPI_APPS.map((a) => (
            <a key={a.key} href={`${ios ? a.ios : a.android}${query}`} className={`${ios ? "btn-saffron" : "btn-ghost"} btn-sm py-2.5`}>
              {a.name}
            </a>
          ))}
        </div>
        {ios && (
          <a href={generic} className="link mt-2 inline-block text-xs">
            Another UPI app (BHIM, bank app…)
          </a>
        )}
      </div>
    </div>
  );
}
