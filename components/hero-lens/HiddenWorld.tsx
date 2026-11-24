// The "hidden world" shown inside the lens: dark teal ground with brightly
// coloured cells, pollen grains and snowflake crystals. Static SVG, generated
// from a fixed seed (so it is identical on every render).
const COLORS = ["#FF7A3D", "#FFD166", "#7CD9B8", "#5EB6FF", "#FF8FB3", "#B6E34A"];

function rng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Item = { kind: "cell" | "pollen" | "crystal"; x: number; y: number; s: number; c: string; rot: number };

const ITEMS: Item[] = (() => {
  const r = rng(7);
  const kinds = ["cell", "pollen", "crystal"] as const;
  return Array.from({ length: 64 }, (_, i) => ({
    kind: kinds[i % 3],
    x: Math.round(r() * 1440),
    y: Math.round(r() * 810),
    s: Math.round(16 + r() * 34),
    c: COLORS[Math.floor(r() * COLORS.length)],
    rot: Math.round(r() * 360),
  }));
})();

const INK = "#041F1D";

function Shape({ it }: { it: Item }) {
  const { s, c } = it;
  const t = `translate(${it.x} ${it.y}) rotate(${it.rot})`;
  if (it.kind === "cell")
    return (
      <g transform={t}>
        <circle r={s} fill={c} stroke={INK} strokeWidth={3} />
        <circle cx={-s * 0.15} cy={-s * 0.1} r={s * 0.38} fill="#fff" fillOpacity={0.45} />
        <circle cx={-s * 0.15} cy={-s * 0.1} r={s * 0.16} fill={INK} />
      </g>
    );
  if (it.kind === "pollen")
    return (
      <g transform={t}>
        {Array.from({ length: 10 }, (_, k) => {
          const a = (k / 10) * Math.PI * 2;
          return <circle key={k} cx={+(Math.cos(a) * s).toFixed(2)} cy={+(Math.sin(a) * s).toFixed(2)} r={+(s * 0.28).toFixed(2)} fill={c} stroke={INK} strokeWidth={2} />;
        })}
        <circle r={s * 0.85} fill={c} stroke={INK} strokeWidth={3} />
      </g>
    );
  return (
    <g transform={t} stroke={c} strokeWidth={4} strokeLinecap="round">
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d={`M${-s} 0H${s}`} />
          <path d={`M${s * 0.6} ${-s * 0.25}L${s} 0L${s * 0.6} ${s * 0.25}`} />
          <path d={`M${-s * 0.6} ${-s * 0.25}L${-s} 0L${-s * 0.6} ${s * 0.25}`} />
        </g>
      ))}
    </g>
  );
}

export default function HiddenWorld() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 810"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <rect width="1440" height="810" fill="#0A3D38" />
      {ITEMS.map((it, i) => (
        <Shape key={i} it={it} />
      ))}
    </svg>
  );
}
