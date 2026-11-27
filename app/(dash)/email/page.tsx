import EmailStudio from '@/components/email/EmailStudio';
import PageHead from '@/components/ui/PageHead';

export default function EmailPage() {
  return (
    <>
      <PageHead title="Email">
        Write, preview and send emails to Stationly users: pick exactly who gets each one, see it the way an inbox does, test it, then send.
      </PageHead>
      <EmailStudio />
    </>
  );
}
