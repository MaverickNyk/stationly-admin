import AboutPanel from '@/components/AboutPanel';
import PageHead from '@/components/ui/PageHead';

export default function SettingsPage() {
  return (
    <>
      <PageHead title="Settings">
        Build, runtime and configuration facts for this console deployment. Read-only — secret values are never
        exposed, only whether they&apos;re set.
      </PageHead>
      <AboutPanel />
    </>
  );
}
