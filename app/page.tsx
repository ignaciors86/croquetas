import { Suspense } from 'react';
import Croquetas from '@/components/Croquetas.jsx';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <Croquetas />
      </Suspense>
    </main>
  );
}

