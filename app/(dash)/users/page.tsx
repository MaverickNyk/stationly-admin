import UsersTable from '@/components/UsersTable';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function UsersPage() {
  return (
    <>
      <PageHead title="Users">
        Registered Stationly users — served from the local cache (0 Firestore reads). Hit Refresh for one live
        read when you need the latest.
      </PageHead>
      <UsersTable env={activeEnv()} />
    </>
  );
}
