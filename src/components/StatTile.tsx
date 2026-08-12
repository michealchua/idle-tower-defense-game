import type { ReactNode } from 'react';

// Pure display atom for the ".stat-grid > .stat-tile" pattern repeated
// across HeroPanel/RecordsPanel/AscensionPanel/etc - every class
// here (stat-tile/-label/-value) already exists in index.css, this just
// stops each panel from re-authoring the same 3-line JSX shape by hand.
// Consumes the project's existing CSS variables only via those classes, no
// inline colors/spacing of its own.
export default function StatTile({ label, value, tooltip }: { label: ReactNode; value: ReactNode; tooltip?: string }) {
  return (
    <div className="stat-tile" data-tooltip={tooltip}>
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{value}</div>
    </div>
  );
}
