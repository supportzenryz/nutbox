// Generated packshots: kraft pouch (retail), jute sack (wholesale), rigid box (gifting).
// The stencilled grade mark is the brand's signature — it's how produce is marked in the mandi.

type Props = {
  kind?: "pouch" | "sack" | "box";
  tone: string;
  mark: string; // stencil text: grade or weight
  sub?: string; // small line under the mark, e.g. origin
  className?: string;
  title?: string;
};

function kernels(tone: string, seed: number, cx: number, cy: number, spread: number) {
  // deterministic scatter of kernels peeking out of the open top
  const out = [];
  for (let i = 0; i < 9; i++) {
    const a = ((seed * 37 + i * 71) % 360) * (Math.PI / 180);
    const r = spread * (0.3 + ((seed + i * 13) % 10) / 14);
    out.push(
      <ellipse
        key={i}
        cx={cx + Math.cos(a) * r}
        cy={cy + Math.sin(a) * r * 0.35}
        rx={9}
        ry={6}
        transform={`rotate(${(seed * 11 + i * 40) % 180} ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r * 0.35})`}
        fill={tone}
        stroke="rgba(0,0,0,.18)"
        strokeWidth={1}
      />,
    );
  }
  return out;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 97;
}

export function Packshot({ kind = "pouch", tone, mark, sub, className, title }: Props) {
  const seed = hash(mark + tone);
  const fs = mark.length > 6 ? 30 : mark.length > 4 ? 38 : 46;
  return (
    <svg viewBox="0 0 240 240" className={className} role="img" aria-label={title ?? `${mark} pack`}>
      <rect width="240" height="240" fill={kind === "sack" ? "#ECE3D2" : "#EEF2E7"} />
      {kind === "pouch" && (
        <g>
          <path d="M62 54 L178 54 L186 206 Q120 216 54 206 Z" fill="#C9A878" />
          <path d="M62 54 L178 54 L180 70 L60 70 Z" fill="#B8955F" />
          <line x1="64" y1="78" x2="176" y2="78" stroke="#A88452" strokeWidth="2" strokeDasharray="4 3" />
          <rect x="78" y="100" width="84" height="70" rx="3" fill="#F7F3EA" />
          <rect x="78" y="100" width="84" height="12" fill={tone} />
          <text x="120" y={148 + (46 - fs) / 3} textAnchor="middle" fontFamily='"Big Shoulders Stencil Display", Impact, sans-serif' fontWeight="800" fontSize={fs - 8} fill="#16211B" {...(mark.length > 4 ? { textLength: 74, lengthAdjust: "spacingAndGlyphs" } : {})}>
            {mark}
          </text>
          {sub && (
            <text x="120" y="163" textAnchor="middle" fontFamily='"Instrument Sans", sans-serif' fontSize="9" fill="#5B685F">
              {sub}
            </text>
          )}
          {kernels(tone, seed, 120, 50, 40)}
        </g>
      )}
      {kind === "sack" && (
        <g>
          <path d="M48 70 Q46 140 52 206 Q120 218 188 206 Q194 140 192 70 Z" fill="#B99766" />
          <path d="M48 70 Q46 140 52 206 Q120 218 188 206 Q194 140 192 70 Z" fill="url(#weave)" opacity=".5" />
          <path d="M44 66 Q120 50 196 66 L192 80 Q120 66 48 80 Z" fill="#A6834F" />
          <text x="120" y="140" textAnchor="middle" fontFamily='"Big Shoulders Stencil Display", Impact, sans-serif' fontWeight="800" fontSize={fs + 2} fill="#1E4A37" opacity=".9" {...(mark.length > 5 ? { textLength: 124, lengthAdjust: "spacingAndGlyphs" } : {})}>
            {mark}
          </text>
          {sub && (
            <text x="120" y="168" textAnchor="middle" fontFamily='"Big Shoulders Stencil Display", Impact, sans-serif' fontWeight="700" fontSize="16" fill="#1E4A37" opacity=".75">
              {sub}
            </text>
          )}
          {kernels(tone, seed, 120, 62, 50)}
          <defs>
            <pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M0 3 H6 M3 0 V6" stroke="#8C6B3E" strokeWidth=".8" />
            </pattern>
          </defs>
        </g>
      )}
      {kind === "box" && (
        <g>
          <rect x="40" y="70" width="160" height="120" rx="4" fill="#C9A878" />
          <rect x="40" y="70" width="160" height="22" fill={tone} />
          <rect x="52" y="104" width="64" height="36" rx="3" fill="#D9BE8F" />
          <rect x="124" y="104" width="64" height="36" rx="3" fill="#B98A5E" />
          <rect x="52" y="146" width="64" height="34" rx="3" fill="#9BAF6B" />
          <rect x="124" y="146" width="64" height="34" rx="3" fill="#A7A04E" />
          <text x="120" y="86" textAnchor="middle" fontFamily='"Big Shoulders Stencil Display", Impact, sans-serif' fontWeight="800" fontSize="15" fill="#F7F3EA">
            {mark}
          </text>
        </g>
      )}
    </svg>
  );
}

export function VegMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center border-2 border-[#2E8B3D] ${className}`} title="Vegetarian" aria-label="Vegetarian">
      <span className="h-2 w-2 rounded-full bg-[#2E8B3D]" />
    </span>
  );
}
