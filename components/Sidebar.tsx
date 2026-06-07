'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import SignOutButton from './SignOutButton';
import { ENV_META, type EnvName } from '@/lib/env';
import {
  IconDashboard,
  IconHealth,
  IconBell,
  IconHistory,
  IconUsers,
  IconClipboard,
  IconPin,
  IconSettings,
} from './ui/icons';

type Item = { href: string; label: string; Icon: (p: any) => JSX.Element };
type Group = { heading: string; items: Item[] };

const GROUPS: Group[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', Icon: IconDashboard },
      { href: '/health', label: 'Health', Icon: IconHealth },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/notifications', label: 'Send notification', Icon: IconBell },
      { href: '/history', label: 'Notification history', Icon: IconHistory },
    ],
  },
  {
    heading: 'Directory',
    items: [
      { href: '/users', label: 'Users', Icon: IconUsers },
      { href: '/waitlist', label: 'Waitlist', Icon: IconClipboard },
      { href: '/stations', label: 'Subscribed stations', Icon: IconPin },
    ],
  },
];

export default function Sidebar({ env }: { env: EnvName }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const meta = ENV_META[env];

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar with the menu toggle (hidden on desktop). */}
      <div className="sidebar-mobilebar">
        <div className="brand">
          <span className="logo">STATIONLY</span>
          <span className="tag">Admin</span>
        </div>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
      </div>

      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand sidebar-brand">
          <span className="logo">STATIONLY</span>
          <span className="tag">Admin</span>
        </div>

        <button
          className="sidebar-search"
          onClick={() => window.dispatchEvent(new Event('open-cmdk'))}
        >
          <span>Search…</span>
          <kbd>⌘K</kbd>
        </button>

        <nav className="sidebar-nav">
          {GROUPS.map((g) => (
            <div className="sidebar-group" key={g.heading}>
              <div className="sidebar-heading">{g.heading}</div>
              {g.items.map(({ href, label, Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link key={href} href={href} className={`sidebar-link${active ? ' active' : ''}`}>
                    <Icon className="sidebar-icon" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Link href="/settings" className={`sidebar-link${pathname.startsWith('/settings') ? ' active' : ''}`}>
            <IconSettings className="sidebar-icon" />
            <span>Settings</span>
          </Link>
          <div className={`sidebar-env ${meta.tone}`}>
            <span className={`env-badge ${meta.tone}`}>{meta.label}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
