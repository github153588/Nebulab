import Link from 'next/link';
import AdvisoryBoardSection from './AdvisoryBoardSection';

export default function AdvisoryBoardPage() {
  return (
    <main className="advisory-page">
      <Link href="/" className="advisory-back-link">
        &larr; Back home
      </Link>

      <AdvisoryBoardSection headingLevel="h1" />
    </main>
  );
}
