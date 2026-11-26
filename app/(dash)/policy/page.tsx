import PolicyEditor from '@/components/PolicyEditor';
import PageHead from '@/components/ui/PageHead';

export default function Page() {
  return (
    <>
      <PageHead title="Notification policy">
        The rules for what phones show (notify.* keys), changed live with a reason.
      </PageHead>
      <PolicyEditor />
    </>
  );
}
