// Shared display-formatting helpers for src/combat/* - step 29's number
// shorthand so damage floating text and HUD readouts don't overlap once
// runs push gold/damage well past 10,000.

const NUMBER_SUFFIX_TIERS: readonly { threshold: number; suffix: string }[] = [
  { threshold: 1e12, suffix: 'T' },
  { threshold: 1e9, suffix: 'B' },
  { threshold: 1e6, suffix: 'M' },
  { threshold: 1e3, suffix: 'K' },
];

/** Below 10,000 the raw (rounded) integer is shown untouched; at/above it, shortened to one decimal place with a K/M/B/T suffix (e.g. 15200 -> "15.2K", 1200000 -> "1.2M") - trailing ".0" is trimmed so a round tier (e.g. 20000) reads "20K" rather than "20.0K". */
export function formatNumber(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 10000) {
    return `${sign}${Math.round(abs)}`;
  }

  const tier = NUMBER_SUFFIX_TIERS.find((candidate) => abs >= candidate.threshold) ?? NUMBER_SUFFIX_TIERS[NUMBER_SUFFIX_TIERS.length - 1];
  const scaled = (abs / tier.threshold).toFixed(1);
  const trimmed = scaled.endsWith('.0') ? scaled.slice(0, -2) : scaled;
  return `${sign}${trimmed}${tier.suffix}`;
}
