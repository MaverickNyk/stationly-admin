'use client';

/**
 * The row above a data table: optional search box, a meta string (e.g.
 * "12 of 40 · refreshed 5m ago") and an actions slot (Refresh / CSV). The
 * actions used to live in a separate `ViewHeader` env strip; the deployment
 * environment is now shown once in the sidebar, so this is the single control
 * row per view.
 */
export default function Toolbar({
  search,
  meta,
  children,
}: {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      {search && (
        <input
          className="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
        />
      )}
      {meta != null && <span className="toolbar-meta">{meta}</span>}
      {children && <div className="toolbar-actions">{children}</div>}
    </div>
  );
}
