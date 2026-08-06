import { useState, type ReactNode } from 'react';

// Progressive-disclosure wrapper - collapses secondary/verbose content
// (affix lists, bulk-upgrade tables, lore text) out of the default card
// view. Shared by every panel that needs it instead of each re-implementing
// its own open/close state.
function Accordion({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button type="button" className="accordion-toggle" onClick={() => setOpen((prev) => !prev)}>
        <span>{title}</span>
        <span className={`accordion-chevron${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

export default Accordion;
