import WaitlistTable from '@/components/WaitlistTable';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function WaitlistPage() {
  return (
    <>
      <PageHead title="Waitlist">
        Launch-waitlist signups from the marketing site. Served from local cache; export to CSV any time.
      </PageHead>
      <WaitlistTable env={activeEnv()} />
    </>
  );
}
