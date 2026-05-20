export const TIERS = [
  { name: "Bronze", min: 0, color: "oklch(0.65 0.10 60)" },
  { name: "Silver", min: 500, color: "oklch(0.75 0.02 270)" },
  { name: "Gold", min: 2000, color: "oklch(0.78 0.16 75)" },
  { name: "Platinum", min: 5000, color: "oklch(0.55 0.22 285)" },
] as const;

export function tierFor(lifetime: number) {
  const t = [...TIERS].reverse().find((x) => lifetime >= x.min) ?? TIERS[0];
  const next = TIERS.find((x) => x.min > lifetime);
  const progress = next ? Math.min(100, ((lifetime - t.min) / (next.min - t.min)) * 100) : 100;
  return { current: t, next, progress, toNext: next ? next.min - lifetime : 0 };
}
