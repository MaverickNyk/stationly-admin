import Dashboard from '@/components/Dashboard';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function HomePage() {
  return (
    <>
      <PageHead title="Dashboard">
        At-a-glance view of Stationly — users, waitlist, watched stations and recent pushes. All served from
        local cache.
      </PageHead>
      <Dashboard env={activeEnv()} />
    </>
  );
}
