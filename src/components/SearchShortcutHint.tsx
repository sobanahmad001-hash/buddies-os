'use client';

import { useEffect, useState } from 'react';

export default function SearchShortcutHint() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes('MAC'));
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-[#E5E2DE] rounded-xl shadow-lg px-3 py-2 text-[11px] text-[#B0ADA9] select-none pointer-events-none">
      Press{' '}
      <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#F0EDE9] border border-[#E5E2DE] rounded text-[10px] font-mono text-[#5C5855]">
        {isMac ? '⌘' : 'Ctrl'}
      </kbd>
      {' '}
      <kbd className="inline-flex items-center px-1.5 py-0.5 bg-[#F0EDE9] border border-[#E5E2DE] rounded text-[10px] font-mono text-[#5C5855]">
        K
      </kbd>
      {' '}to search
    </div>
  );
}
