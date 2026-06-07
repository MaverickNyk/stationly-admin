import HistoryTable from '@/components/HistoryTable';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function HistoryPage() {
  return (
    <>
      <PageHead title="Send history">
        Recent admin sends, newest first. Served from this environment&apos;s local audit log — no Firestore
        reads. Raw device tokens are never stored.
      </PageHead>
      <HistoryTable env={activeEnv()} />
    </>
  );
}
