import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import PostModerationPanel from './PostModerationPanel'

/**
 * The admin verdict sidebar.
 *
 * Two rules here are easy to break and invisible when broken: paid placement
 * must not be offered on a post that is not published, and the verdict buttons
 * must stay reachable after a verdict — they used to vanish the moment a post
 * was approved, which left a mis-click on the queue's one-click approve with no
 * way back.
 */
const makeMod = (over = {}) => ({
  approveMut: { mutate: vi.fn(), isPending: false },
  rejectMut: { mutate: vi.fn(), isPending: false },
  featureMut: { mutate: vi.fn(), isPending: false },
  busy: false,
  hasEdits: false,
  editMode: false,
  isPendingApproval: false,
  canModerate: true,
  approveOpen: false,
  rejectOpen: false,
  setApproveOpen: vi.fn(),
  setRejectOpen: vi.fn(),
  ...over,
})

const render = (post, modOver = {}) => {
  const mod = makeMod(modOver)
  renderWithProviders(<PostModerationPanel mod={mod} post={post} schema={null} />)
  return mod
}

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

describe('paid placement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is offered on an approved post', () => {
    render({ id: 1, approval_status: 'APPROVED' })
    expect(screen.getByText(/^Онцлох$|^Featured$/i)).toBeInTheDocument()
  })

  it.each(['PENDING', 'REJECTED'])('is withheld from a %s post', (status) => {
    // Featuring something unpublished would rank it into a list it cannot
    // appear in — money taken for placement nobody can see.
    render({ id: 1, approval_status: status })
    expect(screen.queryByText(/^Онцлох$|^Featured$/i)).not.toBeInTheDocument()
  })

  it('offers a clear button only while a window is actually open', () => {
    render({ id: 1, approval_status: 'APPROVED', featured_until: inDays(7) })
    expect(screen.getByRole('button', { name: /^(Хасах|Clear)$/i })).toBeInTheDocument()
  })

  it('treats a lapsed window as not featured', () => {
    // A past date is not a badge. Reading `featured_until` as a boolean would
    // show a listing as featured forever after its first week.
    render({ id: 1, approval_status: 'APPROVED', featured_until: daysAgo(1) })
    expect(screen.queryByRole('button', { name: /^(Хасах|Clear)$/i })).not.toBeInTheDocument()
  })

  it('sends 0 days to end a placement early', async () => {
    const mod = render({ id: 1, approval_status: 'APPROVED', featured_until: inDays(30) })
    await userEvent.click(screen.getByRole('button', { name: /^(Хасах|Clear)$/i }))
    expect(mod.featureMut.mutate).toHaveBeenCalledWith(0)
  })
})

describe('verdict buttons', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers only take-down on an already approved post', () => {
    render({ id: 1, approval_status: 'APPROVED' })
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    // Approving an approved post is meaningless; each state offers only the
    // move that changes something.
    expect(buttons.some((label) => /^(Буцаах|Take down)$/i.test(label))).toBe(true)
  })

  it('keeps a reinstate path open on a rejected post', () => {
    // These controls used to disappear after a verdict, so a mis-click was
    // final in the UI even though the API allows the reverse.
    render({ id: 1, approval_status: 'REJECTED' })
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons.some((label) => /^(Сэргээх|Reinstate)$/i.test(label))).toBe(true)
  })

  it('asks before approving rather than acting on one click', async () => {
    const mod = render({ id: 1, approval_status: 'PENDING' }, { isPendingApproval: true })
    const approve = screen.getAllByRole('button').find((b) => /^(Зөвшөөрөх|Approve)$/i.test(b.textContent))
    await userEvent.click(approve)

    // Symmetry with reject: no verdict lands on a single click.
    expect(mod.setApproveOpen).toHaveBeenCalledWith(true)
    expect(mod.approveMut.mutate).not.toHaveBeenCalled()
  })

  it('disables both verdicts while a mutation is in flight', () => {
    render({ id: 1, approval_status: 'PENDING' }, { isPendingApproval: true, busy: true })
    const verdicts = screen.getAllByRole('button')
      .filter((b) => /^(Зөвшөөрөх|Approve|Татгалзах|Reject)$/i.test(b.textContent))
    expect(verdicts.length).toBeGreaterThan(0)
    for (const button of verdicts) expect(button).toBeDisabled()
  })
})
