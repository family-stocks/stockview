'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
export default function Refresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="btn btn-secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? 'Refreshing…' : 'Refresh results'}</button>;
}
