import FlagsEditor from '@/components/FlagsEditor';
import PageHead from '@/components/ui/PageHead';

export default function Page() {
  return (
    <>
      <PageHead title="Feature flags">
        Switch features per platform, live. Every change needs a reason and is kept in the history.
      </PageHead>
      <FlagsEditor />
    </>
  );
}
