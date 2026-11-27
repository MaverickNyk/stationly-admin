'use client';

/**
 * The password re-check for actions that change something. One dialog for the
 * whole console (mounted in the dashboard layout); any component calls
 *
 *   const confirmFetch = useConfirmedFetch();
 *   const data = await confirmFetch('Send this push to everyone', url, init);
 *
 * which asks for the admin password, sends it in `X-Admin-Confirm` for that
 * one request only, asks again on a wrong password, and throws
 * StepUpCancelled if the admin closes the dialog. The password is never kept.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export class StepUpCancelled extends Error {
  constructor() { super('Cancelled.'); this.name = 'StepUpCancelled'; }
}

type Ask = (action: string, error?: string) => Promise<string | null>;
const Ctx = createContext<Ask | null>(null);

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<{ action: string; error?: string; resolve: (v: string | null) => void } | null>(null);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const ask = useCallback<Ask>((action, error) => new Promise((resolve) => {
    setValue('');
    setReq({ action, error, resolve });
  }), []);

  useEffect(() => { if (req) setTimeout(() => input.current?.focus(), 30); }, [req]);

  const close = (v: string | null) => {
    req?.resolve(v);
    setReq(null);
    setValue('');
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {req && (
        <div className="stepup-backdrop" role="dialog" aria-modal="true" aria-labelledby="stepup-title" onMouseDown={(e) => { if (e.target === e.currentTarget) close(null); }}>
          <form className="stepup" onSubmit={(e) => { e.preventDefault(); if (value) close(value); }}>
            <div className="stepup-lock" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            </div>
            <h2 id="stepup-title">Confirm it’s you</h2>
            <p className="stepup-action">{req.action}</p>
            <label htmlFor="stepup-pw">Admin password</label>
            <input id="stepup-pw" ref={input} type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') close(null); }} />
            {req.error && <div className="stepup-error">{req.error}</div>}
            <div className="stepup-buttons">
              <button type="button" className="btn-ghost" onClick={() => close(null)}>Cancel</button>
              <button type="submit" className="btn-send" disabled={!value}>Confirm</button>
            </div>
            <p className="stepup-note">Asked for every action that changes something. Not stored.</p>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** fetch() that asks for the admin password first. Returns parsed JSON. */
export function useConfirmedFetch() {
  const ask = useContext(Ctx);
  return useCallback(async <T = any>(action: string, url: string, init: RequestInit = {}): Promise<T> => {
    if (!ask) throw new Error('StepUpProvider is missing.');
    let error: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const pw = await ask(action, error);
      if (!pw) throw new StepUpCancelled();
      const headers = new Headers(init.headers || {});
      headers.set('X-Admin-Confirm', pw);
      const res = await fetch(url, { ...init, headers });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) return data as T;
      if (data?.stepUp && !data?.locked && res.status === 401) { error = data.message || 'Incorrect password.'; continue; }
      throw new Error(data?.message || `Failed (${res.status})`);
    }
    throw new Error('Too many attempts.');
  }, [ask]);
}
