import { Suspense } from 'react';
import Croquetas25 from '@/components/Croquetas25/Croquetas25';

export const dynamic = 'force-dynamic';

export default function TrackPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <Croquetas25 />
      </Suspense>
    </main>
  );
}

