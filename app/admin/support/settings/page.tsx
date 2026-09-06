'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, AlertTriangle } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { fetchCannedResponses, fetchFaqs, upsertCannedResponses, upsertFaqs, type CannedRow, type FaqRow } from '@/lib/admin-queries';

interface EditableCanned extends CannedRow {
  key: string;
}

interface EditableFaq extends FaqRow {
  key: string;
}

export default function SupportSettingsPage() {
  const { user, ready } = usePermissionGuard('settings.view');
  const [canned, setCanned] = useState<EditableCanned[]>([]);
  const [faqs, setFaqs] = useState<EditableFaq[]>([]);
  const [activeTab, setActiveTab] = useState<'canned' | 'faqs'>('canned');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    Promise.all([fetchCannedResponses(), fetchFaqs()])
      .then(([c, f]) => {
        setCanned((c as EditableCanned[]).map((row) => ({ ...row, key: `c-${row.id}` })));
        setFaqs((f as EditableFaq[]).map((row) => ({ ...row, key: `f-${row.id}` })));
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  const handleAddCanned = () => {
    setCanned([...canned, { key: `c-new-${Date.now()}`, id: 0, label: '', body: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
  };

  const handleAddFaq = () => {
    setFaqs([...faqs, { key: `f-new-${Date.now()}`, id: 0, question: '', answer: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
  };

  const updateCanned = (key: string, patch: Partial<EditableCanned>) => {
    setCanned(canned.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const updateFaq = (key: string, patch: Partial<EditableFaq>) => {
    setFaqs(faqs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const removeCanned = (key: string) => {
    setCanned(canned.filter((c) => c.key !== key));
  };

  const removeFaq = (key: string) => {
    setFaqs(faqs.filter((f) => f.key !== key));
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await Promise.all([
        upsertCannedResponses(canned.map((c) => ({ id: c.id || undefined, label: c.label, body: c.body }))),
        upsertFaqs(faqs.map((f) => ({ id: f.id || undefined, question: f.question, answer: f.answer }))),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setAttempt((a) => a + 1);
    } catch {
      setSaveError('Failed to save. Make sure required fields are filled in.');
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[700px] p-5">
        <PageHeader
          title="Support Settings"
          subtitle="Manage canned responses and FAQs"
          right={
            <button
              onClick={handleSave}
              disabled={status !== 'ok'}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold disabled:opacity-50"
              style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
            >
              <Save size={13} strokeWidth={2.5} />
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          }
        />

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['canned', 'faqs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition-all capitalize"
              style={activeTab === tab ? { background: 'rgba(255,45,149,0.15)', color: '#FF2D95' } : { color: '#6B6C80' }}
            >
              {tab === 'canned' ? 'Canned Responses' : 'FAQ'}
            </button>
          ))}
        </div>

        {saveError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.25)', color: '#FF2D95' }}>
            <AlertTriangle size={14} /> {saveError}
          </div>
        )}

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load support settings." onRetry={() => setAttempt((a) => a + 1)} />
        ) : activeTab === 'canned' ? (
          <div className="flex flex-col gap-3">
            {canned.map((c) => (
              <div key={c.key} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      value={c.label}
                      onChange={(e) => updateCanned(c.key, { label: e.target.value })}
                      placeholder="Response label"
                      className="rounded-lg px-3 py-2 text-[12px] font-semibold outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                    />
                    <textarea
                      value={c.body}
                      onChange={(e) => updateCanned(c.key, { body: e.target.value })}
                      placeholder="Response body..."
                      rows={3}
                      className="resize-none rounded-lg px-3 py-2 text-[12px] outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#D5D6E0' }}
                    />
                  </div>
                  <button onClick={() => removeCanned(c.key)} className="mt-1 rounded-lg p-2 transition-colors hover:bg-white/5" style={{ color: '#6B6C80' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={handleAddCanned}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-[12px] font-semibold transition-colors hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#A7A8B5' }}
            >
              <Plus size={14} /> Add Canned Response
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {faqs.map((f) => (
              <div key={f.key} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      value={f.question}
                      onChange={(e) => updateFaq(f.key, { question: e.target.value })}
                      placeholder="Question"
                      className="rounded-lg px-3 py-2 text-[12px] font-semibold outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                    />
                    <textarea
                      value={f.answer}
                      onChange={(e) => updateFaq(f.key, { answer: e.target.value })}
                      placeholder="Answer..."
                      rows={3}
                      className="resize-none rounded-lg px-3 py-2 text-[12px] outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#D5D6E0' }}
                    />
                  </div>
                  <button onClick={() => removeFaq(f.key)} className="mt-1 rounded-lg p-2 transition-colors hover:bg-white/5" style={{ color: '#6B6C80' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={handleAddFaq}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-[12px] font-semibold transition-colors hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#A7A8B5' }}
            >
              <Plus size={14} /> Add FAQ
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
