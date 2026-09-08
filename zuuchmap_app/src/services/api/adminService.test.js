import adminService from './adminService';
import apiClient from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn() }));

/**
 * The admin calls the app was missing entirely.
 *
 * Every endpoint here already existed and already had a web caller — only the
 * mobile surface was absent, so an admin away from a desk could approve a
 * listing and nothing else. These pin the paths and shapes, which is where a
 * silently-404ing client call would otherwise hide.
 */
describe('adminService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists users from the user prefix, not the admin one', async () => {
    apiClient.get.mockResolvedValue({ data: [{ id: 'u1' }] });
    await expect(adminService.listUsers()).resolves.toEqual([{ id: 'u1' }]);
    // UserAdminController shares the `user` prefix; only the plan grant is an
    // /admin route.
    expect(apiClient.get).toHaveBeenCalledWith('/user');
  });

  it('returns an empty array when the list comes back malformed', async () => {
    // A FlatList handed a non-array throws where it renders, far from here.
    apiClient.get.mockResolvedValue({ data: null });
    await expect(adminService.listUsers()).resolves.toEqual([]);
  });

  it('grants a plan through the admin route with an explicit duration', async () => {
    apiClient.put.mockResolvedValue({ data: { ok: true } });
    await adminService.setPlan('u1', 'PROVIDER', 3);
    expect(apiClient.put).toHaveBeenCalledWith('/admin/users/u1/plan', { plan: 'PROVIDER', months: 3 });
  });

  it('defaults a grant to one month', async () => {
    apiClient.put.mockResolvedValue({ data: {} });
    await adminService.setPlan('u1', 'PROVIDER');
    expect(apiClient.put).toHaveBeenCalledWith('/admin/users/u1/plan', { plan: 'PROVIDER', months: 1 });
  });

  it('deletes an account by id', async () => {
    apiClient.delete.mockResolvedValue({ data: { success: true } });
    await adminService.deleteUser('u1');
    expect(apiClient.delete).toHaveBeenCalledWith('/user/u1');
  });

  it('passes the analytics window as a query param', async () => {
    apiClient.get.mockResolvedValue({ data: { totals: {} } });
    await adminService.summary(90);
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/summary', { params: { days: 90 } });
  });

  it('defaults the analytics window to 30 days', async () => {
    apiClient.get.mockResolvedValue({ data: {} });
    await adminService.summary();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/summary', { params: { days: 30 } });
  });
});
