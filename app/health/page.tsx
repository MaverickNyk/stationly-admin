import Nav from '@/components/Nav';
import HealthDashboard from '@/components/HealthDashboard';
import { activeEnv } from '@/lib/env';

export default function HealthPage() {
  return (
    <>
      <Nav active="/health" />
      <main className="page">
        <div className="page-head">
          <h1>Health</h1>
          <p>
            Every backend endpoint the app actually calls, probed server-side at least once every 5 minutes — so a break
            is caught before it blocks users. The syncer (no endpoint of its own) is inferred from data freshness.
          </p>
        </div>
        <HealthDashboard env={activeEnv()} />
      </main>
    </>
  );
}
