import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import ReportModal from './ReportModal'

vi.mock('@/lib/api', () => ({
  reportsApi: { create: vi.fn(), reasons: vi.fn(async () => ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER']) },
  REPORT_REASONS: ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER'],
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { reportsApi } = await import('@/lib/api')
const { toast } = await import('sonner')

/**
 * Reporting is the only way a user can tell us a live listing has gone bad.
 * What matters is that a reason always reaches the server, and that a repeat
 * report reads as "we already have it" rather than as a failure.
 */
describe('ReportModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits the selected reason with the listing id', async () => {
    reportsApi.create.mockResolvedValue({ id: 'rep-1', duplicate: false })
    const onClose = vi.fn()
    renderWithProviders(<ReportModal open onClose={onClose} postId={7} />)

    await userEvent.click(screen.getByRole('radio', { name: /scam|залилан/i }))
    await userEvent.click(screen.getByRole('button', { name: /submit|илгээх/i }))

    await waitFor(() => expect(reportsApi.create).toHaveBeenCalledWith(7, 'SCAM', undefined))
    expect(onClose).toHaveBeenCalled()
  })

  it('sends the optional detail when one is typed', async () => {
    reportsApi.create.mockResolvedValue({ id: 'rep-2', duplicate: false })
    renderWithProviders(<ReportModal open onClose={vi.fn()} postId={9} />)

    await userEvent.type(screen.getByRole('textbox'), '  дугаар нь ажиллахгүй  ')
    await userEvent.click(screen.getByRole('button', { name: /submit|илгээх/i }))

    // Trimmed — leading and trailing whitespace is not detail.
    await waitFor(() =>
      expect(reportsApi.create).toHaveBeenCalledWith(9, 'SPAM', 'дугаар нь ажиллахгүй')
    )
  })

  // A second report of the same listing is answered with the existing one, not
  // an error — the user did nothing wrong and should not be told they did.
  it('treats a duplicate as success, not failure', async () => {
    reportsApi.create.mockResolvedValue({ id: 'rep-1', duplicate: true })
    renderWithProviders(<ReportModal open onClose={vi.fn()} postId={7} />)

    await userEvent.click(screen.getByRole('button', { name: /submit|илгээх/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports a failure to the user instead of closing silently', async () => {
    reportsApi.create.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    renderWithProviders(<ReportModal open onClose={onClose} postId={7} />)

    await userEvent.click(screen.getByRole('button', { name: /submit|илгээх/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers every reason the server accepts', () => {
    renderWithProviders(<ReportModal open onClose={vi.fn()} postId={7} />)
    // The engine's REPORT_REASONS has six entries; a client offering fewer
    // silently makes some of them unreachable.
    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })
})
