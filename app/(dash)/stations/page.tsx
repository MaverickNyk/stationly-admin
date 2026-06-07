import StationsTable from '@/components/StationsTable';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function StationsPage() {
  return (
    <>
      <PageHead title="Subscribed stations">
        Stations users are actively watching, by subscriber count — joined with station metadata from memory.
        Zero Firestore reads.
      </PageHead>
      <StationsTable env={activeEnv()} />
    </>
  );
}
