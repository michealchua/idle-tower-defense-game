import type { ReactNode } from 'react';

// Pure display atom for the "<div className='card-title'>...</div>
// [<div className='card-subtitle'>...</div>]" pattern every panel
// (HeroPanel/GachaPanel/TalentPanel/RecordsPanel/...) repeats at its own
// top. .card-title is already `display:flex; justify-content:space-between`
// in index.css, which is why `trailing` (a count, a currency readout, a
// resource total) renders correctly right-aligned with zero extra layout
// code here - this component only has to supply the two spans.
export default function PanelHeader({ title, trailing, subtitle }: { title: ReactNode; trailing?: ReactNode; subtitle?: ReactNode }) {
  return (
    <>
      <div className="card-title">
        <span>{title}</span>
        {trailing !== undefined && <span>{trailing}</span>}
      </div>
      {subtitle !== undefined && <div className="card-subtitle">{subtitle}</div>}
    </>
  );
}
