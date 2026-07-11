'use client';

import { useState } from 'react';
import { ALL_VIBES, GRADIENTS } from '@/lib/data';
import { formatNaira } from '@/lib/filters';
import type { PartyFormInput } from '@/lib/queries';
import type { Party, Vibe } from '@/lib/types';

interface PartyFormProps {
  initial?: Party;
  onSubmit: (input: PartyFormInput) => Promise<void>;
  submitLabel: string;
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputStyle = {
  width: '100%',
  background: 'var(--c-glass)',
  border: '1px solid var(--c-border3)',
  borderRadius: 10,
  padding: '13px 14px',
  color: 'var(--c-text)',
  fontSize: 14,
  outline: 'none',
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function PartyForm({ initial, onSubmit, submitLabel }: PartyFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startsAt, setStartsAt] = useState(initial ? toDatetimeLocal(initial.startsAt) : '');
  const [endsAt, setEndsAt] = useState(initial ? toDatetimeLocal(initial.endsAt) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(initial ? String(initial.lat) : '6.4281');
  const [lng, setLng] = useState(initial ? String(initial.lng) : '3.4219');
  const [feeNum, setFeeNum] = useState(initial ? String(initial.feeNum) : '0');
  const [vibe, setVibe] = useState<Vibe>(initial?.vibe ?? 'Club');
  const [capacity, setCapacity] = useState(initial ? String(initial.capacity) : '100');
  const [ageRestriction, setAgeRestriction] = useState(initial?.ageRestriction ?? '18+');
  const [dressCode, setDressCode] = useState(initial?.dressCode ?? 'Casual');
  const [organizer, setOrganizer] = useState(initial?.organizer ?? '');
  const [instagram, setInstagram] = useState(initial?.instagram ?? '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !startsAt || !endsAt || !location.trim() || !address.trim() || !organizer.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    const feeNumParsed = Number(feeNum);
    const latParsed = Number(lat);
    const lngParsed = Number(lng);
    const capacityParsed = Number(capacity);
    if (
      Number.isNaN(feeNumParsed) ||
      feeNumParsed < 0 ||
      Number.isNaN(latParsed) ||
      Number.isNaN(lngParsed) ||
      Number.isNaN(capacityParsed) ||
      capacityParsed <= 0
    ) {
      setError('Please enter valid numbers for fee, coordinates, and capacity.');
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('End time must be after the start time.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        startsAt,
        endsAt,
        location: location.trim(),
        address: address.trim(),
        lat: latParsed,
        lng: lngParsed,
        fee: feeNumParsed === 0 ? 'Free' : formatNaira(feeNumParsed),
        feeNum: feeNumParsed,
        vibe,
        capacity: capacityParsed,
        ageRestriction: ageRestriction.trim() || 'All Ages',
        dressCode: dressCode.trim() || 'Casual',
        organizer: organizer.trim(),
        instagram: instagram.trim(),
        whatsapp: whatsapp.trim(),
        description: description.trim(),
        gradient: GRADIENTS[vibe],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <div className="animate-fade-in rounded-[10px] border px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.32)', color: '#D6402C' }}>
          {error}
        </div>
      )}

      <Field label="Event Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pulse Lagos" style={inputStyle} className="font-heading" />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Starts">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} className="font-heading" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Ends">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle} className="font-heading" />
          </Field>
        </div>
      </div>

      <Field label="Venue Name">
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Quilox Club, Victoria Island" style={inputStyle} className="font-heading" />
      </Field>

      <Field label="Full Address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="15 Ozumba Mbadiwe Ave, Victoria Island, Lagos" style={inputStyle} className="font-heading" />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Latitude">
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="6.4281" style={inputStyle} className="font-heading" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Longitude">
            <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="3.4219" style={inputStyle} className="font-heading" />
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Entry Fee (₦, 0 = Free)">
            <input value={feeNum} onChange={(e) => setFeeNum(e.target.value)} placeholder="15000" style={inputStyle} className="font-heading" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Capacity">
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="500" style={inputStyle} className="font-heading" />
          </Field>
        </div>
      </div>

      <Field label="Vibe / Type">
        <select
          value={vibe}
          onChange={(e) => setVibe(e.target.value as Vibe)}
          style={inputStyle}
          className="cursor-pointer font-heading"
        >
          {ALL_VIBES.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Age Restriction">
            <input value={ageRestriction} onChange={(e) => setAgeRestriction(e.target.value)} placeholder="18+" style={inputStyle} className="font-heading" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Dress Code">
            <input value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="Smart Casual" style={inputStyle} className="font-heading" />
          </Field>
        </div>
      </div>

      <Field label="Organizer Name">
        <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Flytime Music" style={inputStyle} className="font-heading" />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Instagram">
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@flytime_music" style={inputStyle} className="font-heading" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="WhatsApp">
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+2348012345678" style={inputStyle} className="font-heading" />
          </Field>
        </div>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell people what makes this event worth showing up for..."
          rows={4}
          style={inputStyle}
          className="font-heading resize-none"
        />
      </Field>

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-2 w-full rounded-xl border-none py-[15px] font-heading text-sm font-bold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', boxShadow: '0 8px 24px rgba(85,44,183,0.28)' }}
      >
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}
