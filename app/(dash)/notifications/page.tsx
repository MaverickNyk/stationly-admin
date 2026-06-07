import Composer from '@/components/Composer';
import PageHead from '@/components/ui/PageHead';
import { activeEnv } from '@/lib/env';

export default function NotificationsPage({
  searchParams,
}: {
  searchParams: { uid?: string; name?: string };
}) {
  return (
    <>
      <PageHead title="Send a notification">
        Compose a push, pick who gets it, and preview exactly how it lands on a device before sending.
      </PageHead>
      <Composer env={activeEnv()} initialUid={searchParams.uid} initialLabel={searchParams.name} />
    </>
  );
}
