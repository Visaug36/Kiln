'use client';

import { useEffect, useState } from 'react';

/**
 * How many requests this page has made to anybody else. It is zero, and it
 * says so by counting rather than by claiming.
 *
 * The design's line reads "network requests since you opened this page: 0".
 * That number would be a lie: opening Recast fetches its own scripts and
 * fonts, and dropping a file fetches the engine for that pair. What is
 * actually true — and is the whole promise — is that none of them go anywhere
 * but here. So this counts requests to **another origin**, which is the claim
 * a person cares about and the one `pnpm verify:browser` asserts on every
 * commit.
 *
 * Reading the browser's own performance entries is not analytics: nothing is
 * recorded, nothing is sent, and the number never leaves the tab. It is the
 * same thing anyone could read in the network panel, put where it can be seen
 * without opening one.
 */
export default function OffOriginCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const offOrigin = (name: string) => {
      try {
        return new URL(name, location.href).origin !== location.origin;
      } catch {
        return false;
      }
    };

    const seen = new Set<string>();
    const add = (entries: readonly PerformanceEntry[]) => {
      for (const entry of entries) {
        if (entry.entryType === 'resource' && offOrigin(entry.name)) seen.add(entry.name);
      }
      setCount(seen.size);
    };

    // Whatever already happened before this effect ran, then everything after.
    add(performance.getEntriesByType('resource'));

    const observer = new PerformanceObserver((list) => add(list.getEntries()));
    observer.observe({ type: 'resource', buffered: true });
    return () => observer.disconnect();
  }, []);

  return (
    <p className="mt-5 font-mono text-[14px]/[1.6] text-on-plum-soft">
      requests to another server since you opened this page:{' '}
      <span className="font-medium text-on-plum">{count ?? '…'}</span>
    </p>
  );
}
