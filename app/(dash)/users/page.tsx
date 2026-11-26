import UsersTable from '@/components/UsersTable';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function UsersPage() {
  return (
    <>
      <PageHead title="Users">
        Registered Stationly users, served from the backend&apos;s local copy (0 Firestore reads). Accounts that
        change are re-read on their own every hour, and Sync changes does it now. Only those accounts cost a read.
      </PageHead>
      <UsersTable env={activeEnv()} />
    </>
  );
}
