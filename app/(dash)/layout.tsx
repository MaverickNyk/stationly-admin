import Sidebar from '@/components/Sidebar';
import CommandPalette from '@/components/CommandPalette';
import { activeEnv } from '@/lib/env';

/**
 * Shell for the authenticated console: a fixed left sidebar + the scrolling
 * content column. `/login` lives outside this group so it stays full-screen.
 * The deployment environment is resolved server-side and handed to the
 * (client) sidebar for its badge.
 */
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar env={activeEnv()} />
      <div className="app-main">
        <div className="topbar" />
        <main className="page">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
