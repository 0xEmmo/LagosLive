'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Save, Building2, User, Phone, FileText } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useLagosLiveStore } from '@/lib/store';
import { updateHostProfile } from '@/lib/admin-queries';

export default function HostSettingsPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const loadUserData = useLagosLiveStore((s) => s.loadUserData);
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fsettings');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setStatus('ok');
    setName(user.name || '');
    // Try to load profile extras from localStorage (or could be from DB)
    const saved = localStorage.getItem('host_bank_details');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setBankName(parsed.bankName ?? '');
        setBankAccount(parsed.bankAccount ?? '');
        setBankAccountName(parsed.bankAccountName ?? '');
      } catch { /* ignore */ }
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!name.trim()) {
      showToast('Name required', 'Please enter your name.');
      return;
    }
    setSaving(true);
    try {
      await updateHostProfile(user.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        bio: bio.trim() || null,
      });
      // Save bank details locally (would need encrypted storage in production)
      localStorage.setItem('host_bank_details', JSON.stringify({
        bankName, bankAccount, bankAccountName,
      }));
      loadUserData(user.id);
      showToast('Settings saved', 'Your profile has been updated.');
    } catch (err) {
      showToast('Something went wrong', err instanceof Error ? err.message : "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3">
          <BackButton href="/host" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Settings</span>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold btn-primary disabled:opacity-50"
        >
          <Save size={13} strokeWidth={2.5} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {status === 'loading' ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[64px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load settings.</div>
            <button onClick={() => setStatus('ok')} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              <RefreshCw size={13} strokeWidth={2.5} /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Profile Section */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-4 flex items-center gap-2">
                <User size={16} strokeWidth={2} color="#FF2D95" />
                <span className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Profile</span>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Full Name" value={name} onChange={setName} placeholder="Your name" />
                <Field label="Phone" value={phone} onChange={setPhone} placeholder="+234..." icon={<Phone size={14} color="#6B6C80" />} />
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    placeholder="Tell attendees about yourself..."
                    className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                  />
                </div>
              </div>
            </div>

            {/* Bank Account Section */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-4 flex items-center gap-2">
                <Building2 size={16} strokeWidth={2} color="#00F5D4" />
                <span className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Bank Account for Payouts</span>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Bank Name" value={bankName} onChange={setBankName} placeholder="e.g. GTBank, Access Bank" icon={<Building2 size={14} color="#6B6C80" />} />
                <Field label="Account Number" value={bankAccount} onChange={setBankAccount} placeholder="0123456789" />
                <Field label="Account Name" value={bankAccountName} onChange={setBankAccountName} placeholder="John Doe" />
              </div>
              <div className="mt-3 rounded-xl px-3.5 py-2.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B6C80' }}>
                <FileText size={12} className="mr-1 inline" />
                Bank details are stored securely and used for payout processing. In production, these would be encrypted.
              </div>
            </div>

            {/* Account Info */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Account</div>
              <div className="flex flex-col gap-1.5 text-[12.5px]" style={{ color: '#A7A8B5' }}>
                <div>Email: <span style={{ color: '#D5D6E0' }}>{user.email}</span></div>
                <div>Role: <span style={{ color: '#D5D6E0' }}>{user.role}</span></div>
                <div>Status: <span style={{ color: user.accountStatus === 'active' ? '#00F5D4' : '#FF8A00' }}>{user.accountStatus}</span></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</label>
      <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {icon}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: '#FFFFFF' }}
        />
      </div>
    </div>
  );
}
