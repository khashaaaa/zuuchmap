import messageService from './messageService';
import apiClient from './apiClient';

jest.mock('./apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
}));

/**
 * The service is the contract between the screens and the engine. What is
 * worth pinning down is the shape it hands back — a screen that receives
 * `undefined` where it expected a list renders a crash, not an empty state.
 */
describe('messageService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a list even when the engine answers with nothing', async () => {
    apiClient.get.mockResolvedValue({ data: undefined });
    await expect(messageService.list()).resolves.toEqual([]);
  });

  it('reads the unread badge out of the response envelope', async () => {
    apiClient.get.mockResolvedValue({ data: { unread: 4 } });
    await expect(messageService.unreadCount()).resolves.toBe(4);
  });

  it('reports zero unread rather than undefined when the field is missing', async () => {
    apiClient.get.mockResolvedValue({ data: {} });
    await expect(messageService.unreadCount()).resolves.toBe(0);
  });

  it('omits the opening line when there is none, rather than sending an empty body', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'c1' } });
    await messageService.open(7);
    expect(apiClient.post).toHaveBeenCalledWith('/conversations', { post_id: 7 });
  });

  it('sends the opening line when one is given', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'c1' } });
    await messageService.open(7, 'Сайн байна уу');
    expect(apiClient.post).toHaveBeenCalledWith('/conversations', { post_id: 7, body: 'Сайн байна уу' });
  });

  // An offset would drift under the thread: every new message shifts the page
  // boundary, so scrolling back while the other side types skips or repeats.
  it('paginates history with a cursor, and sends none on the first page', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    await messageService.history('c1');
    expect(apiClient.get).toHaveBeenCalledWith('/conversations/c1/messages', { params: undefined });

    await messageService.history('c1', '2026-08-27T00:00:00.000Z');
    expect(apiClient.get).toHaveBeenLastCalledWith('/conversations/c1/messages', {
      params: { before: '2026-08-27T00:00:00.000Z' },
    });
  });
});
