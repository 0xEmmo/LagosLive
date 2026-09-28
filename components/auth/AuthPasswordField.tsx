'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthPasswordField({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? 'Hide password' : 'Show password';

  return (
    <label className="auth-field" htmlFor={id}>
      <span className="auth-field__label">Password</span>
      <span className="auth-password-control">
        <input
          id={id}
          name="password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="••••••••"
          autoComplete={autoComplete}
          required
          className="auth-input auth-input--password"
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={actionLabel}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
        </button>
      </span>
    </label>
  );
}
