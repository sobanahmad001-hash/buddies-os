'use client';

import { Paperclip } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
  // Called with only the NEW files just picked — parent is responsible for accumulating
  onFilesSelected: (newFiles: File[]) => void;
  maxSizeMB?: number;
}

export default function FileUpload({ onFilesSelected, maxSizeMB = 10 }: Props) {
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setError('');

    const oversized = files.find(f => f.size > maxSizeMB * 1024 * 1024);
    if (oversized) {
      setError(`"${oversized.name}" exceeds ${maxSizeMB}MB`);
      setTimeout(() => setError(''), 3000);
      // Reset input so the user can try again
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Always reset so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#F0EDE9] text-[#737373] hover:bg-[#E5E2DE] hover:text-[#1A1A1A] transition-all"
        title="Attach files (images, PDF, txt, doc, zip)"
      >
        <Paperclip size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf,.txt,.doc,.docx,.zip,.tar,.gz"
      />
      {error && (
        <div className="absolute bottom-full mb-2 left-0 whitespace-nowrap text-[12px] text-red-500 bg-white border border-red-200 rounded-lg px-3 py-1.5 shadow-sm z-50">
          {error}
        </div>
      )}
    </div>
  );
}
