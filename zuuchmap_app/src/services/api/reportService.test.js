import reportService, { REPORT_REASONS } from './reportService';
import apiClient from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));

describe('reportService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers exactly the reasons the engine accepts', () => {
    // Mirrors REPORT_REASONS in zuuchmap_engine/src/enums/report.ts. A client
    // offering fewer makes some of them unreachable; more, and the DTO 400s.
    expect(REPORT_REASONS).toEqual(['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER']);
  });

  it('omits an empty detail rather than sending a blank string', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'r1' } });
    await reportService.create(7, 'SPAM');
    expect(apiClient.post).toHaveBeenCalledWith('/reports', { post_id: 7, reason: 'SPAM' });
  });

  it('includes the detail when the reporter wrote one', async () => {
    apiClient.post.mockResolvedValue({ data: { id: 'r1' } });
    await reportService.create(7, 'SCAM', 'урьдчилгаа нэхэж байна');
    expect(apiClient.post).toHaveBeenCalledWith('/reports', {
      post_id: 7, reason: 'SCAM', detail: 'урьдчилгаа нэхэж байна',
    });
  });

  // The badge must read zero, not undefined, when the queue is empty.
  it('reports zero open reports when the field is missing', async () => {
    apiClient.get.mockResolvedValue({ data: {} });
    await expect(reportService.countOpen()).resolves.toBe(0);
  });

  it('falls back to the local reason list if the endpoint returns nothing', async () => {
    apiClient.get.mockResolvedValue({ data: null });
    await expect(reportService.reasons()).resolves.toEqual(REPORT_REASONS);
  });
});
