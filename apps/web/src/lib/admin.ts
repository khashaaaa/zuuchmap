import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAnalytics, AdminListing, AdminOverview, AdminUser, AdminUserDetail, AdminUserFilter, BroadcastEstimate, BroadcastRequest, CategorySchema,
  Paginated, Payment, RejectListingRequest, ReportAction, ReportGroup,
} from '@zuuchmap/core';
import { api } from './api';
import { useAuthStore } from './auth';

const useAdmin = () => useAuthStore((s) => !!s.user?.is_admin);

/** Everything an admin action can change on admin screens and the market. */
function useRefreshAdmin(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const key of ['admin', 'browse', 'listing', 'categories', 'badges']) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export type QueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | '';

export function useAdminListings(status: QueueStatus, q = '', page = 1, limit = 50) {
  const ok = useAdmin();
  return useQuery({
    queryKey: ['admin', 'posts', status, q, page, limit],
    enabled: ok,
    queryFn: () => api<Paginated<AdminListing>>('/admin/posts', { query: { approval_status: status || undefined, q: q || undefined, page, limit } }),
  });
}

/** A decided listing leaves the cached queue at once, so the queue and its "n / total" never count it while the refetch runs. */
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
  return useQuery({ queryKey: ['admin', 'reports', status], enabled: ok, queryFn: () => api<Paginated<ReportGroup>>('/admin/reports', { query: { status } }) });
}

export function useResolveReport() {
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReportAction }) => api<{ ok: true; closed: number }>(`/admin/reports/${id}/resolve`, { method: 'POST', body: { action } }),
    onSuccess: refresh,
  });
}

export function useOverview() {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'overview'], enabled: ok, queryFn: () => api<AdminOverview>('/admin/overview') });
}

export function useAnalytics(days: number) {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'analytics', days], enabled: ok, queryFn: () => api<AdminAnalytics>('/admin/analytics', { query: { days } }) });
}

export function useAdminUsers(q: string, type: AdminUserFilter | '', page = 1) {
  const ok = useAdmin();
  return useQuery({
    queryKey: ['admin', 'users', q, type, page],
    enabled: ok,
    queryFn: () => api<Paginated<AdminUser>>('/admin/users', { query: { q: q || undefined, type: type || undefined, page, limit: 50 } }),
  });
}

export function useAdminUser(id: string | undefined) {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'user', id], enabled: ok && !!id, queryFn: () => api<AdminUserDetail>(`/admin/users/${id ?? ''}`) });
}

export function useUserActions(id: string) {
  const refresh = useRefreshAdmin();
  return {
    grantPlan: useMutation({ mutationFn: (months: number) => api<Payment>(`/admin/users/${id}/plan`, { method: 'POST', body: { months } }), onSuccess: refresh }),
    revokePlan: useMutation({ mutationFn: () => api<{ ok: true }>(`/admin/users/${id}/plan`, { method: 'DELETE' }), onSuccess: refresh }),
    feature: useMutation({
      mutationFn: ({ postId, days }: { postId: number; days: number }) => api<Payment>(`/admin/posts/${postId}/feature`, { method: 'POST', body: { days } }),
      onSuccess: refresh,
    }),
    verify: useMutation({
      mutationFn: ({ companyId, verified }: { companyId: string; verified: boolean }) => api<{ ok: true }>(`/admin/companies/${companyId}/verify`, { method: 'PUT', body: { verified } }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: () => api<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }), onSuccess: refresh }),
  };
}

export function useBroadcastEstimate(body: Pick<BroadcastRequest, 'audience' | 'category'>) {
  const ok = useAdmin();
  return useQuery({
    queryKey: ['admin', 'broadcast', body.audience, body.category ?? ''],
    enabled: ok,
    queryFn: () => api<BroadcastEstimate>('/admin/broadcast/estimate', { method: 'POST', body }),
  });
}

export function useBroadcast() {
  return useMutation({ mutationFn: (body: BroadcastRequest) => api<BroadcastEstimate>('/admin/broadcast', { method: 'POST', body }) });
}

export interface CategoryUsage { posts: number; fields: Record<string, number>; subcategories: Record<string, number> }

export function useAdminCategories() {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'categories'], enabled: ok, queryFn: () => api<CategorySchema[]>('/admin/categories') });
}

export function useCategoryUsage(key: string | undefined) {
  const ok = useAdmin();
  return useQuery({ queryKey: ['admin', 'category-usage', key], enabled: ok && !!key, queryFn: () => api<CategoryUsage>(`/admin/categories/${key ?? ''}/usage`) });
}

export function useSaveCategory() {
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({ key, ...body }: Partial<CategorySchema> & { key: string }) => api<CategorySchema>(`/admin/categories/${key}`, { method: 'PUT', body }),
    onSuccess: refresh,
  });
}

/** Minutes, hours or days a listing has waited in the queue, for "5 цаг хүлээсэн". */
export function waited(since: string, now = Date.now()): { unit: 'minutes' | 'hours' | 'days'; count: number } {
  const min = Math.max(1, Math.round((now - new Date(since).getTime()) / 60_000));
  if (min < 60) return { unit: 'minutes', count: min };
  if (min < 48 * 60) return { unit: 'hours', count: Math.round(min / 60) };
  return { unit: 'days', count: Math.round(min / 1440) };
}

/** When a queue item started waiting: an edit from its submission, a new listing from its creation. */
export const queuedAt = (p: AdminListing): string =>
  (p.pending_revision as { submitted_at?: string } | null)?.submitted_at ?? p.date_created;
