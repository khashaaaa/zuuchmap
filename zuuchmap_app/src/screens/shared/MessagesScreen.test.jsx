import React from 'react';
import { renderWithProviders, navigationStub } from '../../test/render';
import MessagesScreen from './MessagesScreen';
import messageService from '../../services/api/messageService';

jest.mock('../../services/api/messageService', () => ({
  __esModule: true,
  default: { list: jest.fn() },
  CONVERSATIONS_KEY: ['conversations'],
  inboxCursor: (page) => (page.length < 50 ? undefined : page[page.length - 1].last_message_at),
}));

// RNTL v14's render is async — awaiting it is what flushes the mount effects,
// so a screen that loads its data in one is settled before the first query.
const renderScreen = () => renderWithProviders(<MessagesScreen navigation={navigationStub()} />);

/**
 * The app had no component tests at all. This one is deliberately about what a
 * user sees rather than internals: an inbox that renders nothing on an empty
 * list, or drops the unread badge, is broken in a way no service test catches.
 */
describe('MessagesScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the empty state when there are no threads', async () => {
    messageService.list.mockResolvedValue([]);
    const { findByText } = await renderScreen();
    expect(await findByText('Мессеж алга')).toBeTruthy();
  });

  it('renders a thread with its listing and unread count', async () => {
    messageService.list.mockResolvedValue([
      {
        id: 'c-1',
        other_party: { id: 'u-1', given_name: 'Дорж' },
        post: { id: 7, title: 'Экскаватор', images: [] },
        unread: 3,
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Боломжтой юу?',
      },
    ]);
    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Дорж')).toBeTruthy();
    expect(getByText('Экскаватор')).toBeTruthy();
    expect(getByText('Боломжтой юу?')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  // A thread survives its listing being deleted (the FK is SET NULL), so the
  // row has to render without one rather than crashing on a missing title.
  it('renders a thread whose listing has been removed', async () => {
    messageService.list.mockResolvedValue([
      {
        id: 'c-2',
        other_party: { id: 'u-2', given_name: 'Бат' },
        post: null,
        unread: 0,
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Сайн байна уу',
      },
    ]);
    const { findByText } = await renderScreen();
    expect(await findByText('Зар устсан')).toBeTruthy();
  });

  it('caps a very large unread count instead of overflowing the badge', async () => {
    messageService.list.mockResolvedValue([
      {
        id: 'c-3',
        other_party: { id: 'u-3', given_name: 'Сараа' },
        post: { id: 8, title: 'Ачааны машин', images: [] },
        unread: 250,
        last_message_at: new Date().toISOString(),
        last_message_preview: '...',
      },
    ]);
    const { findByText } = await renderScreen();
    expect(await findByText('99+')).toBeTruthy();
  });
});
