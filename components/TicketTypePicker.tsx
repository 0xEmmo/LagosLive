'use client';

import { formatNaira } from '@/lib/filters';
import { MAX_QTY_PER_TYPE, remainingOf, type TicketCart } from '@/lib/tickets';
import type { TicketType } from '@/lib/types';

interface TicketTypePickerProps {
  types: TicketType[];
  cart: TicketCart;
  onChange: (cart: TicketCart) => void;
}

export default function TicketTypePicker({ types, cart, onChange }: TicketTypePickerProps) {
  const setQty = (id: number, qty: number) => {
    const next = { ...cart };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(qty, MAX_QTY_PER_TYPE);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {types.map((type) => {
        const remaining = remainingOf(type);
        const soldOut = remaining <= 0;
        const qty = Math.min(cart[type.id] ?? 0, Math.min(MAX_QTY_PER_TYPE, remaining));
        const selected = qty > 0;

        return (
          <div
            key={type.id}
            className="rounded-2xl px-4 py-3.5 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: selected ? 'rgba(255,90,46,0.08)' : 'rgba(255,255,255,0.03)',
              border: '1px solid',
              borderColor: selected ? 'rgba(255,90,46,0.28)' : 'rgba(255,255,255,0.08)',
              opacity: soldOut ? 0.5 : 1,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{type.name}</div>
                  <div className="font-heading flex-shrink-0 text-[15px] font-bold gradient-text">
                    {type.price === 0 ? 'Free' : formatNaira(type.price)}
                  </div>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: soldOut ? '#FF5A2E' : '#A7A8B5' }}>
                  {soldOut ? 'Sold out' : `${remaining} left`}
                </div>
                {type.description && (
                  <div className="mt-1 text-xs leading-[1.5]" style={{ color: '#6B6C80' }}>{type.description}</div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-[14px]">
                <button
                  onClick={() => setQty(type.id, qty - 1)}
                  disabled={soldOut || qty === 0}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-30 disabled:active:scale-100"
                  style={{ color: '#FFFFFF' }}
                  aria-label={`Fewer ${type.name}`}
                >
                  −
                </button>
                <span className="font-display min-w-[20px] text-center text-xl" style={{ color: '#FFFFFF' }}>{qty}</span>
                <button
                  onClick={() => setQty(type.id, qty + 1)}
                  disabled={soldOut || qty >= remaining || qty >= MAX_QTY_PER_TYPE}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-30 disabled:active:scale-100"
                  style={{ color: '#FFFFFF' }}
                  aria-label={`More ${type.name}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}