import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiErrorMessage } from '@/lib/utils'

/**
 * `useMutation` with the app's default failure toast: the server's error code
 * translated, falling back to `fallback` (default `common.error`). Pass your
 * own `onError` to replace it entirely.
 */
export function useApiMutation({ fallback, onError, ...options } = {}) {
  const { t } = useTranslation()
  return useMutation({
    ...options,
    onError: onError ?? ((e) => toast.error(apiErrorMessage(e, t, fallback ?? t('common.error')))),
  })
}
