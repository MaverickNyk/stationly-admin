'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminUser } from '@/lib/backend';

/**
 * Search the cached users (by email / name / UID) and resolve to a user.
 * Fetches the users list once (0 Firestore reads — served from cache) and
 * filters client-side. Lets you target a user without knowing their UID.
 */
export default function UserPicker({
  onSelect,
  placeholder = 'Search by email or name…',
  clearOnSelect = false,
}: {
  onSelect: (u: AdminUser) => void;
  placeholder?: string;
  /** Clear the search box after picking — for multi-add (chips) flows. */
  clearOnSelect?: boolean;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/admin/data?resource=users');
        const d = await r.json().catch(() => ({}));
        setUsers(Array.isArray(d.items) ? d.items : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return users
      .filter(
        (u) =>
          u.email.toLowerCase().includes(s) ||
          u.displayName.toLowerCase().includes(s) ||
          u.uid.toLowerCase().includes(s),
      )
      .slice(0, 8);
  }, [q, users]);

  return (
    <div className="picker" ref={ref}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && q.trim() && (
        <div className="picker-menu">
          {loading && <div className="picker-empty">Loading users…</div>}
          {!loading && matches.length === 0 && <div className="picker-empty">No match in {users.length} users</div>}
          {matches.map((u) => (
            <button
              key={u.uid}
              type="button"
              className="picker-item"
              onClick={() => {
                onSelect(u);
                setQ(clearOnSelect ? '' : u.displayName || u.email);
                setOpen(false);
              }}
            >
              <span className="pi-name">{u.displayName || '(no name)'}</span>
              <span className="pi-email">{u.email || u.uid}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
