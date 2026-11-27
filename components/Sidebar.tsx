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
  IconChart,
  IconHeart,
  IconToggle,
  IconSliders,
  IconAlert,
  IconMore,
  IconSearch,
  IconMail,
} from './ui/icons';

type Item = { href: string; label: string; Icon: (p: any) => JSX.Element };
type Group = { heading: string; items: Item[] };

/** The phone's bottom bar: the pages opened most from a phone, then the full menu. */
const TABS: Item[] = [
  { href: '/', label: 'Home', Icon: IconDashboard },
  { href: '/users', label: 'Users', Icon: IconUsers },
  { href: '/analytics', label: 'Analytics', Icon: IconChart },
  { href: '/support', label: 'Support', Icon: IconHeart },
];

const isActive = (href: string, pathname: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

const GROUPS: Group[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', Icon: IconDashboard },
      { href: '/analytics', label: 'Analytics', Icon: IconChart },
      { href: '/support', label: 'Support money', Icon: IconHeart },
      { href: '/health', label: 'Health', Icon: IconHealth },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/notifications', label: 'Send notification', Icon: IconBell },
      { href: '/email', label: 'Email', Icon: IconMail },
      { href: '/history', label: 'Notification history', Icon: IconHistory },
      { href: '/flags', label: 'Feature flags', Icon: IconToggle },
      { href: '/policy', label: 'Notification policy', Icon: IconSliders },
      { href: '/closures', label: 'Station closures', Icon: IconAlert },
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
        <div className="mobilebar-actions">
          <button className="nav-toggle" aria-label="Search" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>
            <IconSearch />
          </button>
          <span className={`env-badge ${meta.tone}`}>{meta.label}</span>
        </div>
      </div>

      {/* Phone bottom bar (hidden on desktop). The last tab opens the full menu. */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={`tabbar-item${isActive(href, pathname) && !open ? ' active' : ''}`}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
        <button
          className={`tabbar-item${open || !TABS.some((t) => isActive(t.href, pathname)) ? ' active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <IconMore />
          <span>More</span>
        </button>
      </nav>

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
                const active = isActive(href, pathname);
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
