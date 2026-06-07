'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/useResource';
import type { AdminUser } from '@/lib/backend';
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

type Cmd = { label: string; sub?: string; href: string; Icon: (p: any) => JSX.Element };

const PAGES: Cmd[] = [
  { label: 'Dashboard', href: '/', Icon: IconDashboard },
  { label: 'Health', href: '/health', Icon: IconHealth },
  { label: 'Send notification', href: '/notifications', Icon: IconBell },
  { label: 'Notification history', href: '/history', Icon: IconHistory },
  { label: 'Users', href: '/users', Icon: IconUsers },
  { label: 'Waitlist', href: '/waitlist', Icon: IconClipboard },
  { label: 'Subscribed stations', href: '/stations', Icon: IconPin },
  { label: 'Settings', href: '/settings', Icon: IconSettings },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K toggle, plus an `open-cmdk` event the sidebar button fires.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-cmdk', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-cmdk', onOpen);
    };
  }, []);

  // On first open: focus the box and lazily load the (cached, 0-read) user list.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    inputRef.current?.focus();
    if (users.length === 0) {
      fetchJson<{ items: AdminUser[] }>('/api/admin/data?resource=users')
        .then((d) => setUsers(d.items ?? []))
        .catch(() => {});
    }
  }, [open, users.length]);

  const results = useMemo<Cmd[]>(() => {
    const s = q.trim().toLowerCase();
    const pages = s ? PAGES.filter((p) => p.label.toLowerCase().includes(s)) : PAGES;
    const userCmds: Cmd[] = !s
      ? []
      : users
          .filter(
            (u) => u.displayName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s),
          )
          .slice(0, 6)
          .map((u) => ({
            label: u.displayName || u.email || u.uid,
            sub: 'send a push',
            href: `/notifications?uid=${encodeURIComponent(u.uid)}&name=${encodeURIComponent(
              u.displayName || u.email,
            )}`,
            Icon: IconBell,
          }));
    return [...pages, ...userCmds];
  }, [q, users]);

  const go = useCallback(
    (cmd?: Cmd) => {
      if (!cmd) return;
      setOpen(false);
      router.push(cmd.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  }

  if (!open) return null;

  const pageCount = q.trim() ? results.filter((r) => PAGES.includes(r)).length : PAGES.length;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command menu" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          aria-label="Search pages and users"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page or search a user…"
        />
        <div className="cmdk-list">
          {results.length === 0 ? (
            <div className="cmdk-empty">No matches</div>
          ) : (
            results.map((r, i) => (
              <div key={r.href + r.label}>
                {i === 0 && pageCount > 0 && <div className="cmdk-section">Pages</div>}
                {i === pageCount && pageCount < results.length && (
                  <div className="cmdk-section">Users</div>
                )}
                <button
                  className={`cmdk-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                >
                  <r.Icon className="sidebar-icon" />
                  <span>{r.label}</span>
                  {r.sub && <span className="cmdk-sub">{r.sub}</span>}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="cmdk-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
