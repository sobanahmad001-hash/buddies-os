'use client';

import { Globe, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onSearch: (query: string) => void;
}

export default function WebSearchButton({ onSearch }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim());
      setQuery('');
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#F0EDE9] text-[#737373] hover:bg-[#E5E2DE] hover:text-[#1A1A1A] transition-all"
        title="Search the web"
      >
        <Globe size={16} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#1A1A1A]">Search the Web</h3>
              <button onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-[#F0EDE9] rounded transition-colors">
                <X size={16} className="text-[#737373]" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="What do you want to search?"
              className="w-full px-4 py-3 bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] text-[#1A1A1A] text-[14px] mb-4 transition-colors"
            />

            <div className="flex gap-3">
              <button onClick={handleSearch}
                className="flex-1 px-4 py-2.5 bg-[#E8521A] hover:bg-[#c94415] text-white rounded-lg transition-colors font-medium text-[14px]">
                Search
              </button>
              <button onClick={() => setIsOpen(false)}
                className="px-4 py-2.5 bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] rounded-lg transition-colors text-[14px]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
