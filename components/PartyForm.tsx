'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Ticket, ImagePlus, X, Plus, ChevronUp, ChevronDown, Trash2, MapPin, CheckCircle2 } from 'lucide-react';
import { ALL_VIBES, GRADIENTS } from '@/lib/data';
import { formatNaira } from '@/lib/filters';
import AddressInput, { type LocationResult } from '@/components/AddressInput';
import { geocodePlace, hasGeoapifyKey } from '@/lib/geoapify';
import type { PartyFormInput, PartySubmitMode, TicketFormType } from '@/lib/queries';
import type { Party, Vibe } from '@/lib/types';

// Reuse the exact same map implementation the public event page uses for the
// in-form location preview — never a second map provider.
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });

interface PartyFormProps {
  initial?: Party;
  initialTicketTypes?: TicketFormType[];
  // mode tells the page what the host asked for: 'submit' moves the event into
  // pending review (+ ops Telegram), 'draft' keeps it a private draft.
  onSubmit: (input: PartyFormInput, mode: PartySubmitMode) => Promise<void>;
  // Hide the submit-for-review action (e.g. an admin editing a host's event).
  disableSubmit?: boolean;
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
  | 'ticketTypes'
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

export default function PartyForm({ initial, initialTicketTypes, onSubmit, disableSubmit }: PartyFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startsAt, setStartsAt] = useState(initial ? toDatetimeLocal(initial.startsAt) : '');
  const [endsAt, setEndsAt] = useState(initial ? toDatetimeLocal(initial.endsAt) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(initial ? String(initial.lat) : '6.4281');
  const [lng, setLng] = useState(initial ? String(initial.lng) : '3.4219');
  // The exact address the current lat/lng belong to. A manual edit clears it so
  // one venue's coordinates can never be saved against another venue's address.
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(initial?.address?.trim() || null);
  const [isFree, setIsFree] = useState(initial ? initial.feeNum === 0 : true);
  const [vibe, setVibe] = useState<Vibe>(initial?.vibe ?? 'Club');
  const [tickets, setTickets] = useState<TicketFormType[]>(() => {
    const incoming = initialTicketTypes && initialTicketTypes.length > 0 ? initialTicketTypes : null;
    if (incoming) {
      return incoming.map((t, i) => ({
        ...t,
        price: Number(t.price),
        quantity: Number(t.quantity),
        sortOrder: i,
        salesStartAt: t.salesStartAt ? toDatetimeLocal(t.salesStartAt) : null,
        salesEndAt: t.salesEndAt ? toDatetimeLocal(t.salesEndAt) : null,
      }));
    }
    if (initial) {
      return [
        {
          name: 'General Entry',
          price: initial.feeNum,
          quantity: initial.capacity,
          description: null,
          salesStartAt: null,
          salesEndAt: null,
          active: true,
          sortOrder: 0,
        },
      ];
    }
    return [
      {
        name: 'General Entry',
        price: 0,
        quantity: 0,
        description: null,
        salesStartAt: null,
        salesEndAt: null,
        active: true,
        sortOrder: 0,
      },
    ];
  });
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
  const [busy, setBusy] = useState<PartySubmitMode | null>(null);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const clearError = (key: FieldName) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  // Single source of truth for the address: the parent owns the text the host
  // sees, so what is displayed is exactly what validates and submits. A null
  // location means the address was edited by hand and the old coordinates are
  // no longer trustworthy — clear them immediately.
  const handleAddressChange = (next: string, location: LocationResult | null) => {
    clearError('address');
    setAddress(next);
    if (location) {
      setLat(String(location.latitude));
      setLng(String(location.longitude));
      setResolvedAddress(location.formatted || next);
      clearError('lat');
      clearError('lng');
    } else {
      setResolvedAddress(null);
      setLat('');
      setLng('');
    }
  };

  // Safety net for hosts who type an address and submit without blurring the
  // field first: geocode it right before validation so the coordinates belong
  // to the address being saved.
  const resolveAddressForSubmit = async (): Promise<{ lat: number; lng: number } | null> => {
    const trimmed = address.trim();
    if (!trimmed) return null;
    if (resolvedAddress === trimmed && lat.trim() && lng.trim()) {
      const currentLat = Number(lat);
      const currentLng = Number(lng);
      if (Number.isFinite(currentLat) && Number.isFinite(currentLng)) {
        return { lat: currentLat, lng: currentLng };
      }
    }
    if (!hasGeoapifyKey()) return null;
    try {
      const place = await geocodePlace(trimmed);
      if (!place) return null;
      setLat(String(place.lat));
      setLng(String(place.lon));
      setResolvedAddress(trimmed);
      return { lat: place.lat, lng: place.lon };
    } catch {
      return null;
    }
  };

  const updateTicket = (index: number, patch: Partial<TicketFormType>) => {
    setTickets((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTicket = () => {
    setTickets((list) => [
      ...list,
      { name: '', price: 0, quantity: 1, description: null, salesStartAt: null, salesEndAt: null, active: true, sortOrder: list.length },
    ]);
  };

  const removeTicket = (index: number) => {
    setTickets((list) => list.filter((_, i) => i !== index).map((t, i) => ({ ...t, sortOrder: i })));
  };

  const moveTicket = (index: number, delta: -1 | 1) => {
    setTickets((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next.map((t, i) => ({ ...t, sortOrder: i }));
    });
  };

  const switchFree = (free: boolean) => {
    setIsFree(free);
    setErrors((e) => ({ ...e, ticketTypes: undefined }));
    if (free) {
      setTickets((list) => [
        {
          name: 'General Entry',
          price: 0,
          quantity: Math.max(1, list.reduce((sum, t) => sum + Math.trunc(Number(t.quantity)) || 0, 0)),
          description: null,
          salesStartAt: null,
          salesEndAt: null,
          active: true,
          sortOrder: 0,
        },
      ]);
    }
  };

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

  // Returns a human-readable problem with the ticket tiers, or null when they
  // are ready to save. Runs on submit (and covers both the free single-tier
  // case and the paid multi-tier case).
  const validateTickets = (): string | null => {
    if (isFree) {
      const qty = Math.trunc(Number(tickets[0]?.quantity));
      if (!Number.isInteger(qty) || qty <= 0) return 'Set the number of free tickets available.';
      return null;
    }

    if (tickets.length === 0) return 'Add at least one ticket type.';
    const names = new Set<string>();
    let hasPaidTier = false;
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const label = `Ticket type ${i + 1}`;
      const name = t.name.trim();
      if (!name) return `${label} needs a name.`;
      const lower = name.toLowerCase();
      if (names.has(lower)) return `Two ticket types are both named “${name}”.`;
      names.add(lower);
      const price = Math.trunc(Number(t.price));
      if (!Number.isInteger(price) || price < 0) return `${label} price must be ₦0 or more.`;
      const quantity = Math.trunc(Number(t.quantity));
      if (!Number.isInteger(quantity) || quantity <= 0) return `${label} needs a quantity of at least 1.`;
      if (t.sold !== undefined && t.sold > 0 && quantity < t.sold) {
        return `${label} can't go below ${t.sold} ticket${t.sold === 1 ? '' : 's'} already sold.`;
      }
      if (t.salesStartAt && t.salesEndAt && new Date(t.salesEndAt) <= new Date(t.salesStartAt)) {
        return `${label} sales end must be after sales start.`;
      }
      if (price > 0) hasPaidTier = true;
    }
    if (!hasPaidTier) return 'A paid event needs at least one ticket type priced above ₦0.';
    return null;
  };

  // Form validation. A finished listing ('submit') is held to the full bar;
  // a draft only needs what the database requires to actually save, so the
  // editorial niceties (description length, past start time, optional contact
  // formats) don't block a host mid-write.
  const validate = (coords?: { lat: number; lng: number } | null, mode: PartySubmitMode = 'submit'): boolean => {
    const e: Partial<Record<FieldName, string>> = {};

    if (!title.trim()) e.title = 'Event title is required.';
    if (!startsAt) e.startsAt = 'Pick a start date & time.';
    if (!endsAt) e.endsAt = 'Pick an end date & time.';
    if (!location.trim()) e.location = 'Venue name is required.';
    if (!address.trim()) e.address = 'Full address is required.';
    if (!organizer.trim()) e.organizer = 'Organizer name is required.';
    if (mode === 'submit' && description.trim().length > 0 && description.trim().length < 20) {
      e.description = 'Make the description a little longer (at least 20 characters).';
    }

    // Number('') is 0, so an empty coordinate must be rejected explicitly —
    // otherwise an unlocated address would silently save at 0,0.
    const latRaw = (coords ? String(coords.lat) : lat).trim();
    const lngRaw = (coords ? String(coords.lng) : lng).trim();
    const latParsed = Number(latRaw);
    const lngParsed = Number(lngRaw);
    const latValid = latRaw !== '' && Number.isFinite(latParsed) && latParsed >= -90 && latParsed <= 90;
    const lngValid = lngRaw !== '' && Number.isFinite(lngParsed) && lngParsed >= -180 && lngParsed <= 180;
    if (!latValid) e.lat = latRaw === '' ? 'Confirm the address or enter latitude manually.' : 'Latitude must be a number between -90 and 90.';
    if (!lngValid) e.lng = lngRaw === '' ? 'Confirm the address or enter longitude manually.' : 'Longitude must be a number between -180 and 180.';
    if (address.trim() && !(latValid && lngValid) && !e.address) {
      e.address = "Couldn't locate this address. Please select a suggested location or check the address.";
    }

    const ticketIssue = validateTickets();
    if (ticketIssue) e.ticketTypes = ticketIssue;

    if (startsAt && endsAt) {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (end <= start) {
        e.endsAt = 'End time must be after the start time.';
      } else if (mode === 'submit' && !initial && start.getTime() < Date.now()) {
        e.startsAt = 'Start time can\'t be in the past.';
      }
    }

    if (mode === 'submit') {
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
    }

    setErrors(e);
    if (Object.keys(e).length > 0) {
      setError('Please fix the highlighted fields below.');
      return false;
    }
    return true;
  };

  const submit = async (mode: PartySubmitMode) => {
    setError('');
    setBusy(mode);
    try {
      const located = await resolveAddressForSubmit();
      if (!validate(located, mode)) {
        setBusy(null);
        return;
      }
      const latParsed = located ? located.lat : Number(lat);
      const lngParsed = located ? located.lng : Number(lng);
      const capacityParsed = tickets.reduce((sum, t) => sum + Math.trunc(Number(t.quantity)), 0);
      const feeParsed = isFree ? 0 : Math.min(...tickets.map((t) => Math.trunc(Number(t.price))));
      const ticketTypes = tickets.map((t) => ({
        ...t,
        price: Math.trunc(Number(t.price)),
        quantity: Math.trunc(Number(t.quantity)),
        salesStartAt: t.salesStartAt ? new Date(t.salesStartAt).toISOString() : null,
        salesEndAt: t.salesEndAt ? new Date(t.salesEndAt).toISOString() : null,
      }));
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
        ticketTypes,
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
      }, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  const capacityTotal = tickets.reduce((sum, t) => sum + Math.trunc(Number(t.quantity)) || 0, 0);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasPreview =
    lat.trim() !== '' &&
    lng.trim() !== '' &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    !(latNum === 0 && lngNum === 0);

  // Minimal Party shape so the existing EventMap can render the exact same
  // single-marker preview the public event page shows.
  const previewParty = useMemo<Party>(
    () => ({
      id: initial?.id ?? 0,
      title: title.trim() || 'Your event',
      slug: null,
      date: '',
      time: '',
      startsAt: startsAt || new Date().toISOString(),
      endsAt: endsAt || new Date().toISOString(),
      location: location.trim() || 'Venue',
      address: address.trim(),
      lat: latNum,
      lng: lngNum,
      fee: 'Free',
      feeNum: 0,
      distance: 0,
      vibe,
      capacity: 0,
      spotsLeft: 1,
      ageRestriction: '18+',
      dressCode: 'Casual',
      organizer: '',
      instagram: '',
      whatsapp: '',
      organizerPhone: null,
      organizerEmail: null,
      description: '',
      gradient: GRADIENTS[vibe],
      isWeekend: false,
      isThisWeek: false,
      createdBy: null,
      status: 'draft',
      coverUrl: null,
      cancelledAt: null,
      cancellationReason: null,
      soldOutAt: null,
      closedAt: null,
      reviewReason: null,
      reviewCount: 0,
      avgRating: 0,
    }),
    [initial?.id, title, location, address, latNum, lngNum, vibe, startsAt, endsAt]
  );

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
            Events without a photo use this category&apos;s gradient colors.
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
          <AddressInput
            value={address}
            inputStyle={inputStyle}
            onChange={handleAddressChange}
            placeholder="35 Adeola Odeku, Victoria Island, Lagos"
          />
          {resolvedAddress === address.trim() && address.trim() && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: '#00F5D4' }}>
              <CheckCircle2 size={13} strokeWidth={2} />
              Location confirmed
            </div>
          )}
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
        {hasPreview && (
          <div className="overflow-hidden rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="h-[180px]">
              <EventMap parties={[previewParty]} single />
            </div>
          </div>
        )}

        <div className="text-[11px]" style={{ color: '#6B6C80' }}>
          Start typing your address and pick from the suggestions — coordinates are filled in automatically to power the
          map and ride links. Editing the address by hand clears the old coordinates and re-locates it. You can still
          adjust the numbers manually if needed.
        </div>
      </Section>

      {/* 3. Tickets & pricing */}
      <Section step={3} title="Tickets & Pricing" hint={isFree ? 'How many people can come for free' : 'Add every ticket type people can buy'}>
        <Field label="Entry">
          <div className="flex gap-2.5">
            <button
              onClick={() => switchFree(true)}
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
              onClick={() => switchFree(false)}
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
            className="rounded-[10px] px-3.5 py-3"
            style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.2)' }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: '#00F5D4' }}>
              <Ticket size={14} strokeWidth={2} />
              General Entry · Free
            </div>
            <Field label="Capacity (free spots)">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={tickets[0]?.quantity ? String(tickets[0].quantity) : ''}
                onChange={(e) => updateTicket(0, { quantity: Number(e.target.value) })}
                placeholder="500"
                style={inputStyle}
                className="font-heading"
              />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((t, i) => (
              <div
                key={t.id ?? `new-${i}`}
                className="rounded-xl p-3.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <input
                    value={t.name}
                    onChange={(e) => updateTicket(i, { name: e.target.value })}
                    placeholder={`Ticket type ${i + 1} name`}
                    style={{ ...inputStyle, padding: '11px 12px', fontSize: 13 }}
                    className="font-heading"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={String(t.price)}
                    onChange={(e) => updateTicket(i, { price: Number(e.target.value) })}
                    placeholder="₦ price"
                    style={{ ...inputStyle, padding: '11px 12px', fontSize: 13, width: 96 }}
                    className="font-heading"
                  />
                </div>

                <div className="mb-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateTicket(i, { active: !t.active })}
                    className="rounded-lg px-2.5 py-[7px] text-[10.5px] font-bold uppercase tracking-[0.5px] transition-all duration-200 active:scale-95"
                    style={{
                      background: t.active ? 'rgba(0,245,212,0.08)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${t.active ? 'rgba(0,245,212,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      color: t.active ? '#00F5D4' : '#6B6C80',
                    }}
                  >
                    {t.active ? 'On sale' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTicket(i, -1)}
                    disabled={i === 0}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg glass glass-hover disabled:opacity-30"
                    style={{ color: '#A7A8B5' }}
                    aria-label="Move ticket type up"
                  >
                    <ChevronUp size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTicket(i, 1)}
                    disabled={i === tickets.length - 1}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg glass glass-hover disabled:opacity-30"
                    style={{ color: '#A7A8B5' }}
                    aria-label="Move ticket type down"
                  >
                    <ChevronDown size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTicket(i)}
                    className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-all duration-200 active:scale-90"
                    style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF5A2E' }}
                    aria-label="Remove ticket type"
                  >
                    <Trash2 size={13} strokeWidth={2.5} />
                  </button>
                </div>

                <input
                  value={t.description ?? ''}
                  onChange={(e) => updateTicket(i, { description: e.target.value })}
                  placeholder="What's included? (optional)"
                  style={{ ...inputStyle, padding: '11px 12px', fontSize: 13, marginBottom: 10 }}
                  className="font-heading"
                />

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="mb-[6px] text-[9.5px] font-semibold uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>
                      Quantity {t.sold ? `(${t.sold} sold)` : ''}
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={String(t.quantity)}
                      onChange={(e) => updateTicket(i, { quantity: Number(e.target.value) })}
                      placeholder="200"
                      style={{ ...inputStyle, padding: '10px', fontSize: 12.5, minWidth: 0 }}
                      className="font-heading"
                    />
                  </div>
                  <div>
                    <div className="mb-[6px] text-[9.5px] font-semibold uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>
                      Sales start
                    </div>
                    <input
                      type="datetime-local"
                      value={t.salesStartAt ?? ''}
                      onChange={(e) => updateTicket(i, { salesStartAt: e.target.value || null })}
                      style={{ ...inputStyle, padding: '10px', fontSize: 12.5, minWidth: 0 }}
                      className="font-heading"
                    />
                  </div>
                  <div>
                    <div className="mb-[6px] text-[9.5px] font-semibold uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>
                      Sales end
                    </div>
                    <input
                      type="datetime-local"
                      value={t.salesEndAt ?? ''}
                      onChange={(e) => updateTicket(i, { salesEndAt: e.target.value || null })}
                      style={{ ...inputStyle, padding: '10px', fontSize: 12.5, minWidth: 0 }}
                      className="font-heading"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addTicket}
              className="flex items-center justify-center gap-1.5 rounded-[10px] py-[11px] text-[12.5px] font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{ background: 'rgba(255,45,149,0.07)', border: '1px dashed rgba(255,45,149,0.35)', color: '#FF2D95' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Ticket Type
            </button>
          </div>
        )}

        {errors.ticketTypes && <FieldError message={errors.ticketTypes} />}

        <div
          className="rounded-[10px] px-3.5 py-2.5 text-[12px] leading-[1.7]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={{ color: '#6B6C80' }}>Total capacity </span>
          <span className="font-semibold" style={{ color: '#FFFFFF' }}>{capacityTotal.toLocaleString()} spots</span>
          {!isFree && (
            <>
              <span style={{ color: '#6B6C80' }}> · From </span>
              <span className="font-semibold" style={{ color: '#00F5D4' }}>
                {tickets.length > 0 ? formatNaira(Math.min(...tickets.map((t) => Math.trunc(Number(t.price))))) : formatNaira(0)}
              </span>
            </>
          )}
        </div>
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

      {/* 5. Cover image — one event, one cover image */}
      <Section step={5} title="Cover Image" hint="One image · one cover">
        {previewUrl || initial?.coverUrl ? (
          <div>
            <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: '16/9' }}>
              <img src={previewUrl ?? initial?.coverUrl ?? ''} alt="Event cover" className="h-full w-full object-cover" />
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleImageRemove}
                  aria-label="Remove selected image"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 active:opacity-70"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <X size={14} strokeWidth={2.5} color="#FFFFFF" />
                </button>
              )}
              <div
                className="absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: 'rgba(0,0,0,0.5)', color: '#A7A8B5' }}
              >
                {previewUrl && coverImage ? `${(coverImage.size / 1024 / 1024).toFixed(1)} MB` : 'Current cover'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              className="mt-2 w-full rounded-[10px] py-[11px] text-[12.5px] font-semibold transition-colors duration-200 active:opacity-80"
              style={{ background: 'rgba(255,45,149,0.07)', border: '1px dashed rgba(255,45,149,0.35)', color: '#FF2D95' }}
            >
              {previewUrl ? 'Choose a different image' : 'Change image'}
            </button>
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
          Upload one image for your event. If you don&apos;t, the card uses an auto-generated
          gradient in this category&apos;s colors.
        </div>
      </Section>

      {/* Actions — two explicit choices so "saving" and "submitting" can never
          be confused. A finished listing is submitted for review; anything the
          host isn't ready for yet is saved as a draft (kept private, no ops
          Telegram notification until it's actually submitted). */}
      <SubmitActions
        initial={initial}
        disableSubmit={disableSubmit}
        busy={busy}
        submit={submit}
      />
    </div>
  );
}

function SubmitActions({
  initial,
  disableSubmit,
  busy,
  submit,
}: {
  initial?: Party;
  disableSubmit?: boolean;
  busy: PartySubmitMode | null;
  submit: (mode: PartySubmitMode) => void;
}) {
  const isEditing = !!initial;
  const isRejected = isEditing && initial.status === 'rejected';
  const isDraft = isEditing && initial.status === 'draft';
  // The event can be pushed into review: a brand-new form, or an existing
  // draft / rejected listing the host is re-submitting after edits.
  const canSubmit = !disableSubmit && (!isEditing || isDraft || isRejected);

  const draftLabel = isEditing ? 'Save Changes' : 'Save as Draft';
  const submitLabel = isEditing ? (isRejected ? 'Resubmit for Review' : 'Submit for Review') : 'Submit for Review';

  if (!canSubmit) {
    return (
      <button
        onClick={() => submit('submit')}
        disabled={busy !== null}
        className="btn-primary mt-1 w-full py-[15px] text-sm font-bold disabled:opacity-60"
      >
        {busy === 'submit' ? 'Saving...' : 'Save Changes'}
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5">
      <button
        onClick={() => submit('submit')}
        disabled={busy !== null}
        className="btn-primary w-full py-[15px] text-sm font-bold disabled:opacity-60"
      >
        {busy === 'submit' ? 'Submitting for Review...' : submitLabel}
      </button>
      <button
        onClick={() => submit('draft')}
        disabled={busy !== null}
        className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover transition-all disabled:opacity-60"
        style={{ color: '#A7A8B5' }}
      >
        {busy === 'draft' ? (isEditing ? 'Saving Changes...' : 'Saving Draft...') : draftLabel}
      </button>
      {!isEditing && (
        <div className="px-1 text-center text-[11.5px] leading-[1.6]" style={{ color: '#6B6C80' }}>
          Save as Draft keeps your listing private — no admin review until you submit it.
        </div>
      )}
    </div>
  );
}
