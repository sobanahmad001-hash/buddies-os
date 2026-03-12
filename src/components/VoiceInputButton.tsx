'use client';

import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
}

export default function VoiceInputButton({ onTranscript }: VoiceInputButtonProps) {
  const { isRecording, isProcessing, startRecording, recordAndTranscribe } = useVoiceRecording();

  const handleClick = async () => {
    if (isProcessing) return;
    if (isRecording) {
      try {
        const transcript = await recordAndTranscribe();
        if (transcript) onTranscript(transcript);
      } catch {
        // error already logged in hook
      }
    } else {
      try {
        await startRecording();
      } catch {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      }
    }
  };

  if (isProcessing) {
    return (
      <button
        disabled
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-400 text-white"
        title="Transcribing…"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </button>
    );
  }

  if (isRecording) {
    return (
      <button
        onClick={handleClick}
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500 hover:bg-red-600 text-white animate-pulse transition-colors"
        title="Click to stop recording"
      >
        <MicOff className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#737373] hover:text-[#1A1A1A] transition-colors"
      title="Click to start voice input"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
