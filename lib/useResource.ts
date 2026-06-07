'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Fetch JSON, mirroring the error handling every data view used to repeat:
 * parse the body defensively, and on a non-2xx surface `data.message` (the
 * backend's error shape) or a `Failed (status)` fallback.
 */
export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((data as any)?.message || `Failed (${res.status})`);
  return data as T;
}

export interface Resource<T> {
  data: T | null;
  busy: boolean;
  error: string;
  /** Re-fetch. Pass `true` to use `refreshUrl` (a live, costed read). */
  reload: (refresh?: boolean) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * The shared load/busy/error/refresh lifecycle that used to be copy-pasted into
 * every table and dashboard. URLs are passed as strings (stable across renders)
 * so the auto-load effect doesn't loop.
 *
 * @param url        endpoint for the default (cached) load
 * @param refreshUrl endpoint for an explicit Refresh; defaults to `url`
 */
export function useResource<T = any>(
  url: string,
  refreshUrl: string = url,
  { auto = true, init }: { auto?: boolean; init?: RequestInit } = {},
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(
    async (refresh = false) => {
      setBusy(true);
      setError('');
      try {
        setData(await fetchJson<T>(refresh ? refreshUrl : url, init));
      } catch (e: any) {
        setData(null);
        setError(e?.message ?? 'Network error');
      } finally {
        setBusy(false);
      }
    },
    [url, refreshUrl, init],
  );

  useEffect(() => {
    if (auto) reload(false);
  }, [auto, reload]);

  return { data, busy, error, reload, setData };
}
