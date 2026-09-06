'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';

/**
 * Client-safe permission check. Returns true only when the signed-in user's
 * (multi) roles grant `permission`, or the user is a super_admin.
 *
 * First consults the store's cached permission list (loaded once at login via
 * user_permissions()) so navigation/buttons render instantly; then reconciles
 * with the authoritative user_has_permission() RPC so a stale cache can never
 * over-grant.
 *
 * NOT a security boundary — server-side RLS is the real gate.
 */
export function usePermission(permission: string) {
  const cachedPermissions = useLagosLiveStore((s) => s.user?.permissions ?? null);
  const user = useLagosLiveStore((s) => s.user);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      // super_admin short-circuit without a round-trip.
      if (user?.role === 'super_admin') {
        setHasPermission(true);
        setIsLoading(false);
        return;
      }

      // Fast path: the store already has the full permission list.
      if (cachedPermissions) {
        setHasPermission(cachedPermissions.includes(permission));
        setIsLoading(false);
      }

      // Authoritative path: verify against the DB so a stale cache can't
      // over-grant (e.g. after a role change in another session/tab).
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!authUser) {
        setHasPermission(false);
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.rpc('user_has_permission', {
        p_user_id: authUser.id,
        p_permission_name: permission,
      });

      if (cancelled) return;
      setHasPermission(!!data);
      setIsLoading(false);
    };

    checkPermission();
    return () => {
      cancelled = true;
    };
  }, [permission, cachedPermissions, user?.role, user?.id]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { refreshUser } = useLagosLiveStore.getState();
    await refreshUser();
    setIsLoading(false);
  }, []);

  return { hasPermission, isLoading, refresh };
}

/**
 * Guards a whole component render behind a permission. Returns ready=true once
 * the check has resolved; the caller renders a "no access" state otherwise.
 */
export function usePermissionGuard(permission: string) {
  const user = useLagosLiveStore((s) => s.user);
  const { hasPermission, isLoading } = usePermission(permission);
  const ready = !isLoading && hasPermission === true;
  return { ready, allowed: hasPermission === true, isLoading, user };
}

/** Checks several permissions at once against the store cache (no RPC). */
export function usePermissions(permissions: string[]) {
  const cachedPermissions = useLagosLiveStore((s) => s.user?.permissions ?? null);
  const user = useLagosLiveStore((s) => s.user);
  return {
    allowed: (permission: string) =>
      user?.role === 'super_admin' || (cachedPermissions?.includes(permission) ?? false),
    all: permissions.every((p) => user?.role === 'super_admin' || (cachedPermissions?.includes(p) ?? false)),
  };
}