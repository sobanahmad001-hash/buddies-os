'use client';

import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function FileUpload({ onFilesSelected, maxFiles = 5, maxSizeMB = 10 }: Props) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setError('');

    if (files.length + selectedFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const oversized = files.find(f => f.size > maxSizeMB * 1024 * 1024);
    if (oversized) {
      setError(`"${oversized.name}" exceeds ${maxSizeMB}MB limit`);
      return;
    }

    const newFiles = [...selectedFiles, ...files];
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#F0EDE9] text-[#737373] hover:bg-[#E5E2DE] hover:text-[#1A1A1A] transition-all"
        title="Attach files"
      >
        <Paperclip size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf,.txt,.doc,.docx"
      />

      {error && (
        <div className="absolute bottom-full mb-2 left-0 text-[12px] text-red-500 bg-white border border-red-200 rounded-lg px-3 py-1.5">
          {error}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 right-0 space-y-1.5 bg-white border border-[#E5E2DE] rounded-xl p-3 shadow-lg">
          {selectedFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-2 px-2 py-1.5 bg-[#F7F5F2] rounded-lg">
              {file.type.startsWith('image/') ? (
                <ImageIcon size={14} className="text-[#E8521A] shrink-0" />
              ) : (
                <FileText size={14} className="text-[#737373] shrink-0" />
              )}
              <span className="flex-1 text-[12px] text-[#1A1A1A] truncate">{file.name}</span>
              <span className="text-[11px] text-[#B0ADA9]">{(file.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => removeFile(index)}
                className="p-0.5 hover:bg-[#E5E2DE] rounded transition-colors">
                <X size={12} className="text-[#737373]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
