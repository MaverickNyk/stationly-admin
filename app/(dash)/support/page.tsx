import SupportMoney from '@/components/SupportMoney';
import PageHead from '@/components/ui/PageHead';

export default function Page() {
  return (
    <>
      <PageHead title="Support money">
        What supporters have given each month, by route, against the running cost.
      </PageHead>
      <SupportMoney />
    </>
  );
}
