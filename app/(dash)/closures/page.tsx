import ClosuresView from '@/components/ClosuresView';
import PageHead from '@/components/ui/PageHead';

export default function Page() {
  return (
    <>
      <PageHead title="Station closures">
        What TfL says is closed right now, and what the closures log has seen.
      </PageHead>
      <ClosuresView />
    </>
  );
}
