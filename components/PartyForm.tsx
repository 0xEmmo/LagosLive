'use client';

import { useState, useRef, useCallback } from 'react';
import { Ticket, ImagePlus, X } from 'lucide-react';
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
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '13px 14px',
  color: '#FFFFFF',
  fontSize: 14,
  outline: 'none',
} as const;

type FieldName =
  | 'title'
  | 'startsAt'
  | 'endsAt'
  | 'location'
  | 'address'
  | 'lat'
  | 'lng'
  | 'fee'
  | 'capacity'
  | 'organizer'
  | 'organizerPhone'
  | 'organizerEmail'
  | 'description'
  | 'whatsapp';

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-[7px] flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: '#A7A8B5' }}>
        <span>{label}</span>
        {optional && <span className="normal-case" style={{ color: '#6B6C80' }}>(optional)</span>}
      </div>
      {children}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mt-1.5 animate-fade-in text-[12px]" style={{ color: '#FF8A00' }}>
      {message}
    </div>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-heading text-[11px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}
        >
          {step}
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold uppercase tracking-[0.8px]" style={{ color: '#FFFFFF' }}>{title}</div>
          <div className="text-[11px]" style={{ color: '#6B6C80' }}>{hint}</div>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
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
  const [feeNum, setFeeNum] = useState(initial ? String(initial.feeNum) : '');
  const [isFree, setIsFree] = useState(initial ? initial.feeNum === 0 : true);
  const [vibe, setVibe] = useState<Vibe>(initial?.vibe ?? 'Club');
  const [capacity, setCapacity] = useState(initial ? String(initial.capacity) : '');
  const [ageRestriction, setAgeRestriction] = useState(initial?.ageRestriction ?? '18+');
  const [dressCode, setDressCode] = useState(initial?.dressCode ?? 'Casual');
  const [organizer, setOrganizer] = useState(initial?.organizer ?? '');
  const [organizerPhone, setOrganizerPhone] = useState(initial?.organizerPhone ?? '');
  const [organizerEmail, setOrganizerEmail] = useState(initial?.organizerEmail ?? '');
  const [instagram, setInstagram] = useState(initial?.instagram ?? '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const clearError = (key: FieldName) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 5 * 1024 * 1024;

  const handleImageSelect = useCallback((file: File) => {
    setImageError('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setImageError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setImageError('Image must be under 5 MB.');
      return;
    }
    setCoverImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  }, [handleImageSelect]);

  const handleImageRemove = useCallback(() => {
    setCoverImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageError('');
    if (imageRef.current) imageRef.current.value = '';
  }, [previewUrl]);

  const validate = (): boolean => {
    const e: Partial<Record<FieldName, string>> = {};

    if (!title.trim()) e.title = 'Event title is required.';
    if (!startsAt) e.startsAt = 'Pick a start date & time.';
    if (!endsAt) e.endsAt = 'Pick an end date & time.';
    if (!location.trim()) e.location = 'Venue name is required.';
    if (!address.trim()) e.address = 'Full address is required.';
    if (!organizer.trim()) e.organizer = 'Organizer name is required.';
    if (description.trim().length > 0 && description.trim().length < 20) {
      e.description = 'Make the description a little longer (at least 20 characters).';
    }

    const latParsed = Number(lat);
    const lngParsed = Number(lng);
    if (Number.isNaN(latParsed) || latParsed < -90 || latParsed > 90) e.lat = 'Latitude must be a number between -90 and 90.';
    if (Number.isNaN(lngParsed) || lngParsed < -180 || lngParsed > 180) e.lng = 'Longitude must be a number between -180 and 180.';

    const capacityParsed = Number(capacity);
    if (Number.isNaN(capacityParsed) || !Number.isInteger(capacityParsed) || capacityParsed <= 0) {
      e.capacity = 'Capacity must be a whole number greater than 0.';
    }

    if (!isFree) {
      const feeParsed = Number(feeNum);
      if (Number.isNaN(feeParsed) || feeParsed < 0) e.fee = 'Entry fee must be ₦0 or more.';
    }

    if (startsAt && endsAt) {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (end <= start) {
        e.endsAt = 'End time must be after the start time.';
      } else if (!initial && start.getTime() < Date.now()) {
        e.startsAt = 'Start time can\'t be in the past.';
      }
    }

    const digits = whatsapp.replace(/\D/g, '');
    if (whatsapp.trim() && digits.length < 7) {
      e.whatsapp = 'Enter a valid WhatsApp number, e.g. +2348012345678.';
    }

    if (organizerPhone.trim()) {
      const phoneDigits = organizerPhone.replace(/\D/g, '');
      if (phoneDigits.length < 7) {
        e.organizerPhone = 'Enter a valid phone number, e.g. +2349012345678.';
      }
    }

    if (organizerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail.trim())) {
      e.organizerEmail = 'Enter a valid email address.';
    }

    setErrors(e);
    if (Object.keys(e).length > 0) {
      setError('Please fix the highlighted fields below.');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    const feeParsed = isFree ? 0 : Number(feeNum);
    const latParsed = Number(lat);
    const lngParsed = Number(lng);
    const capacityParsed = Number(capacity);
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
        fee: feeParsed === 0 ? 'Free' : formatNaira(feeParsed),
        feeNum: feeParsed,
        vibe,
        capacity: capacityParsed,
        ageRestriction: ageRestriction.trim() || 'All Ages',
        dressCode: dressCode.trim() || 'Casual',
        organizer: organizer.trim(),
        instagram: instagram.trim(),
        whatsapp: whatsapp.trim(),
        organizerPhone: organizerPhone.trim(),
        organizerEmail: organizerEmail.trim(),
        description: description.trim(),
        gradient: GRADIENTS[vibe],
        coverImage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <div className="animate-fade-in rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#FF8A00' }}>
          {error}
        </div>
      )}

      {/* 1. About the event */}
      <Section step={1} title="About the Event" hint="Name, type and what people should know">
        <Field label="Event Title">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError('title');
            }}
            placeholder="Pulse Lagos"
            style={inputStyle}
            className="font-heading"
          />
          <FieldError message={errors.title} />
        </Field>

        <Field label="Category / Vibe">
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
          <div className="mt-1.5 text-[11px]" style={{ color: '#6B6C80' }}>
            Your cover image is generated automatically from the category.
          </div>
        </Field>

        <Field label="Description" optional>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError('description');
            }}
            placeholder="Tell people what makes this event worth showing up for..."
            rows={4}
            style={inputStyle}
            className="font-heading resize-none"
          />
          <FieldError message={errors.description} />
        </Field>
      </Section>

      {/* 2. When & where */}
      <Section step={2} title="When & Where" hint="Date, times and venue">
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Starts (date & time)">
              <input type="datetime-local" value={startsAt} onChange={(e) => { setStartsAt(e.target.value); clearError('startsAt'); }} style={inputStyle} className="font-heading" />
              <FieldError message={errors.startsAt} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Ends (date & time)">
              <input type="datetime-local" value={endsAt} onChange={(e) => { setEndsAt(e.target.value); clearError('endsAt'); }} style={inputStyle} className="font-heading" />
              <FieldError message={errors.endsAt} />
            </Field>
          </div>
        </div>

        <Field label="Venue Name">
          <input value={location} onChange={(e) => { setLocation(e.target.value); clearError('location'); }} placeholder="Quilox Club, Victoria Island" style={inputStyle} className="font-heading" />
          <FieldError message={errors.location} />
        </Field>

        <Field label="Full Address">
          <input value={address} onChange={(e) => { setAddress(e.target.value); clearError('address'); }} placeholder="15 Ozumba Mbadiwe Ave, Victoria Island, Lagos" style={inputStyle} className="font-heading" />
          <FieldError message={errors.address} />
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Latitude">
              <input type="number" inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); clearError('lat'); }} placeholder="6.4281" style={inputStyle} className="font-heading" />
              <FieldError message={errors.lat} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Longitude">
              <input type="number" inputMode="decimal" value={lng} onChange={(e) => { setLng(e.target.value); clearError('lng'); }} placeholder="3.4219" style={inputStyle} className="font-heading" />
              <FieldError message={errors.lng} />
            </Field>
          </div>
        </div>
        <div className="text-[11px]" style={{ color: '#6B6C80' }}>
          Coordinates power the map and ride links. Pre-filled with Victoria Island — update if your venue is elsewhere.
        </div>
      </Section>

      {/* 3. Tickets & capacity */}
      <Section step={3} title="Tickets & Capacity" hint="Price and how many people can come">
        <Field label="Entry">
          <div className="flex gap-2.5">
            <button
              onClick={() => setIsFree(true)}
              className="flex-1 rounded-[10px] py-[11px] text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]"
              style={{
                background: isFree ? 'rgba(0,245,212,0.08)' : 'rgba(255,255,255,0.04)',
                border: '1px solid',
                borderColor: isFree ? 'rgba(0,245,212,0.3)' : 'rgba(255,255,255,0.08)',
                color: isFree ? '#00F5D4' : '#A7A8B5',
              }}
            >
              Free Entry
            </button>
            <button
              onClick={() => setIsFree(false)}
              className="flex-1 rounded-[10px] py-[11px] text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]"
              style={{
                background: !isFree ? 'rgba(255,45,149,0.08)' : 'rgba(255,255,255,0.04)',
                border: '1px solid',
                borderColor: !isFree ? 'rgba(255,45,149,0.3)' : 'rgba(255,255,255,0.08)',
                color: !isFree ? '#FF2D95' : '#A7A8B5',
              }}
            >
              Paid Entry
            </button>
          </div>
        </Field>

        {isFree ? (
          <div
            className="flex items-center gap-2 rounded-[10px] px-3.5 py-[13px] text-sm font-semibold"
            style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.2)', color: '#00F5D4' }}
          >
            <Ticket size={14} strokeWidth={2} />
            Free Entry
          </div>
        ) : (
          <Field label="Entry Fee (₦)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={feeNum}
              onChange={(e) => {
                setFeeNum(e.target.value);
                clearError('fee');
              }}
              placeholder="15000"
              style={inputStyle}
              className="font-heading"
            />
            <FieldError message={errors.fee} />
          </Field>
        )}

        <Field label="Capacity">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value);
              clearError('capacity');
            }}
            placeholder="500"
            style={inputStyle}
            className="font-heading"
          />
          <FieldError message={errors.capacity} />
        </Field>
      </Section>

      {/* 4. Contact & details */}
      <Section step={4} title="Contact & Details" hint="Who you are and who can come">
        <Field label="Organizer Name">
          <input value={organizer} onChange={(e) => { setOrganizer(e.target.value); clearError('organizer'); }} placeholder="Flytime Music" style={inputStyle} className="font-heading" />
          <FieldError message={errors.organizer} />
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Organizer Phone" optional>
              <input
                type="tel"
                value={organizerPhone}
                onChange={(e) => { setOrganizerPhone(e.target.value); clearError('organizerPhone'); }}
                placeholder="+234 901 234 5678"
                style={inputStyle}
                className="font-heading"
              />
              <FieldError message={errors.organizerPhone} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Organizer Email" optional>
              <input
                type="email"
                value={organizerEmail}
                onChange={(e) => { setOrganizerEmail(e.target.value); clearError('organizerEmail'); }}
                placeholder="organizer@example.com"
                style={inputStyle}
                className="font-heading"
              />
              <FieldError message={errors.organizerEmail} />
            </Field>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Instagram" optional>
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@flytime_music" style={inputStyle} className="font-heading" />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="WhatsApp" optional>
              <input value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); clearError('whatsapp'); }} placeholder="+2348012345678" style={inputStyle} className="font-heading" />
              <FieldError message={errors.whatsapp} />
            </Field>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Age Restriction" optional>
              <input value={ageRestriction} onChange={(e) => setAgeRestriction(e.target.value)} placeholder="18+" style={inputStyle} className="font-heading" />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Dress Code" optional>
              <input value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="Smart Casual" style={inputStyle} className="font-heading" />
            </Field>
          </div>
        </div>
      </Section>

      {/* 5. Cover image */}
      <Section step={5} title="Cover Image" hint="Make your event stand out (optional)">
        {previewUrl ? (
          <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: '16/9' }}>
            <img src={previewUrl} alt="Cover preview" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={handleImageRemove}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-90"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X size={14} strokeWidth={2.5} color="#FFFFFF" />
            </button>
            <div className="absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.5)' , color: '#A7A8B5' }}>
              {coverImage ? `${(coverImage.size / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleImageDrop}
            onClick={() => imageRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-8 transition-all duration-200"
            style={{
              borderColor: dragOver ? 'rgba(255,45,149,0.5)' : 'rgba(255,255,255,0.1)',
              background: dragOver ? 'rgba(255,45,149,0.04)' : 'transparent',
            }}
          >
            <ImagePlus size={24} strokeWidth={1.5} color={dragOver ? '#FF2D95' : '#6B6C80'} />
            <div className="text-[12px] font-semibold" style={{ color: dragOver ? '#FF2D95' : '#A7A8B5' }}>
              {dragOver ? 'Drop image here' : 'Tap to upload or drag an image'}
            </div>
            <div className="text-[10.5px]" style={{ color: '#6B6C80' }}>JPEG, PNG or WebP · Max 5 MB</div>
          </div>
        )}
        <input
          ref={imageRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
          }}
        />
        <FieldError message={imageError} />
        <div className="text-[11px]" style={{ color: '#6B6C80' }}>
          If you don&apos;t upload an image, your event will use an auto-generated gradient card.
        </div>
      </Section>

      <button
        onClick={submit}
        disabled={submitting}
        className="btn-primary mt-1 w-full py-[15px] text-sm font-bold disabled:opacity-60"
      >
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}
