'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, User } from 'lucide-react';

export default function HostAvatarUploader({ value, onFileChange, disabled = false }: { value: string | null; onFileChange: (file: File | null) => void; disabled?: boolean }) {
  const [preview, setPreview] = useState(value);
  const [error, setError] = useState('');

  useEffect(() => setPreview(value), [value]);

  const choose = (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use JPG, PNG, or WebP.');
      onFileChange(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      onFileChange(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setPreview(next);
    onFileChange(file);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'linear-gradient(135deg, #2B68FF, #00D9FF)' }}>
        {preview ? <img src={preview} alt="Profile preview" className="h-full w-full object-cover" /> : <User size={25} color="#FFFFFF" />}
      </div>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold" style={{ background: 'rgba(43,104,255,0.12)', border: '1px solid rgba(43,104,255,0.25)', color: '#8EACFF', opacity: disabled ? 0.5 : 1 }}>
          <ImagePlus size={14} /> Upload profile picture
          <input data-testid="host-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={disabled} onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <div className="mt-1 text-[10px]" style={{ color: error ? '#FF8A00' : '#6B6C80' }}>{error || 'JPG, PNG, or WebP · max 5 MB'}</div>
      </div>
    </div>
  );
}
