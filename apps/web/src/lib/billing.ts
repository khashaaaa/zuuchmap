import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvoiceCreateRequest, Payment, PaymentCatalogue, PaymentInvoice, ReportCreateRequest } from '@zuuchmap/core';
import { api } from './api';
import { useAuthStore } from './auth';

/** How often an open QR asks whether it was paid. */
const POLL_MS = 3000;

export function useCatalogue() {
  return useQuery({ queryKey: ['payments', 'catalogue'], staleTime: 5 * 60_000, queryFn: () => api<PaymentCatalogue>('/payments/catalogue') });
}

export function useMyPayments() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['payments', 'mine', token], enabled: !!token, queryFn: () => api<Payment[]>('/payments/mine') });
}

export function useCreateInvoice() {
  return useMutation({ mutationFn: (body: InvoiceCreateRequest) => api<PaymentInvoice>('/payments/invoice', { method: 'POST', body }) });
}

/**
 * The invoice's status while its QR is on screen. Once it is paid, everything a payment grants
 * (plan, quota, featured flags) is refetched.
 */
export function usePaymentStatus(id: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['payments', 'status', id],
    enabled: !!id,
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'PENDING' ? false : POLL_MS),
    queryFn: () => api<Payment>(`/payments/${id ?? ''}/status`),
  });
  const paid = q.data?.status === 'PAID';
  useEffect(() => {
    if (!paid) return;
    for (const key of ['payments', 'provider', 'badges', 'browse', 'listing']) void qc.invalidateQueries({ queryKey: [key] });
  }, [paid, qc]);
  return q;
}

export function useResendReceipt() {
  return useMutation({ mutationFn: (id: string) => api<{ ok: true }>(`/payments/${id}/receipt`, { method: 'POST' }) });
}

export function useReport() {
  return useMutation({ mutationFn: (body: ReportCreateRequest) => api<{ id: string }>('/reports', { method: 'POST', body }) });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => api<{ ok: true }>('/user/account', { method: 'DELETE' }) });
}
