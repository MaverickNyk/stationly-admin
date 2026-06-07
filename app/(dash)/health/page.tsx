import HealthDashboard from '@/components/HealthDashboard';
import PageHead from '@/components/ui/PageHead';

export default function HealthPage() {
  return (
    <>
      <PageHead title="Health">
        Every backend endpoint the app actually calls, probed server-side at least once every 5 minutes — so a
        break is caught before it blocks users. The syncer (no endpoint of its own) is inferred from data
        freshness.
      </PageHead>
      <HealthDashboard />
    </>
  );
}
