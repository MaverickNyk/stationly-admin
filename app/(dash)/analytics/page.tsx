import Analytics from '@/components/Analytics';
import PageHead from '@/components/ui/PageHead';

export default function Page() {
  return (
    <>
      <PageHead title="Analytics">
        Who uses Stationly on Android, iOS and the web, which versions they run, and what they do in the app. Everything here comes from the backend&apos;s local copies, so opening this page costs no Firestore reads.
      </PageHead>
      <Analytics />
    </>
  );
}
