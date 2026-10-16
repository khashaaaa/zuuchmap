import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAnalytics, AdminListing, AdminOverview, AdminUser, AdminUserFilter, Paginated, Payment, RejectListingRequest, ReportAction, ReportGroup,
} from '@zuuchmap/core';
import { api } from './api';
import { useAuth } from './auth';

const useAdmin = () => !!useAuth().user?.is_admin;

/** The app carries the admin's queues (Figma J1–J9); configuration lives on the web. */
function useRefreshAdmin(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const key of ['admin', 'browse', 'listing', 'badges']) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export type QueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | '';

export function useAdminListings(status: QueueStatus, q = '', limit = 50) {
  const ok = useAdmin();
  return useQuery({
    queryKey: ['admin', 'posts', status, q, limit],
    enabled: ok,
    queryFn: () => api<Paginated<AdminListing>>('/admin/posts', { params: { approval_status: status || undefined, q: q || undefined, limit } }),
  });
}

/** A decided listing leaves the cached queue at once, so the next review's "n / total" never counts it while the refetch runs. */
function useDecided(): (id: number) => void {
  const qc = useQueryClient();
  const refresh = useRefreshAdmin();
  return (id) => {
    qc.setQueriesData<Paginated<AdminListing>>({ queryKey: ['admin', 'posts', 'PENDING'] }, (old) =>
      old?.items.some((p) => p.id === id) ? { ...old, items: old.items.filter((p) => p.id !== id), total: old.total - 1 } : old);
    refresh();
  };
}

export function useApprove() {
  const decided = useDecided();
  return useMutation({ mutationFn: (id: number) => api<AdminListing>(`/admin/posts/${id}/approve`, { method: 'POST' }), onSuccess: (_, id) => decided(id) });
}

export function useReject() {
  const decided = useDecided();
  return useMutation({
    mutationFn: ({ id, ...body }: RejectListingRequest & { id: number }) => api<AdminListing>(`/admin/posts/${id}/reject`, { method: 'POST', body }),
    onSuccess: (_, { id }) => decided(id),
  });
}

export function useReports(status: 'OPEN' | 'CLOSED') {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'reports', status], enabled: ok, queryFn: () => api<Paginated<ReportGroup>>('/admin/reports', { params: { status } }) });
}

export function useResolveReport() {
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReportAction }) => api<{ ok: true }>(`/admin/reports/${id}/resolve`, { method: 'POST', body: { action } }),
    onSuccess: refresh,
  });
}

export function useOverview() {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'overview'], enabled: ok, queryFn: () => api<AdminOverview>('/admin/overview') });
}

export function useAnalytics(days: number) {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'analytics', days], enabled: ok, queryFn: () => api<AdminAnalytics>('/admin/analytics', { params: { days } }) });
}

export function useAdminUsers(q: string, type: AdminUserFilter | '') {
  const ok = useAdmin();
  return useQuery({
    queryKey: ['admin', 'users', q, type],
    enabled: ok,
    queryFn: () => api<Paginated<AdminUser>>('/admin/users', { params: { q: q || undefined, type: type || undefined, limit: 50 } }),
  });
}

/** Figma J6: extend or cancel a provider's plan from the list. */
export function usePlanActions() {
  const refresh = useRefreshAdmin();
  return {
    extend: useMutation({ mutationFn: ({ id, months }: { id: string; months: number }) => api<Payment>(`/admin/users/${id}/plan`, { method: 'POST', body: { months } }), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => api<{ ok: true }>(`/admin/users/${id}/plan`, { method: 'DELETE' }), onSuccess: refresh }),
  };
}

/** Minutes, hours or days a listing has waited in the queue. */
export function waited(since: string, now = Date.now()): { unit: 'Minutes' | 'Hours' | 'Days'; count: number } {
  const min = Math.max(1, Math.round((now - new Date(since).getTime()) / 60_000));
  if (min < 60) return { unit: 'Minutes', count: min };
  if (min < 48 * 60) return { unit: 'Hours', count: Math.round(min / 60) };
  return { unit: 'Days', count: Math.round(min / 1440) };
}

export const queuedAt = (p: AdminListing): string =>
  (p.pending_revision as { submitted_at?: string } | null | undefined)?.submitted_at ?? p.date_created;
