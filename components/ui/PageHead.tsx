/**
 * The title + one-line description block that opens every screen. Replaces the
 * `.page-head` markup that was duplicated across the seven page files.
 */
export default function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
