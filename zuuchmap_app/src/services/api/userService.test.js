import userService from './userService';
import apiClient from './apiClient';
import { getAuthToken, getUserType, getUserInfo } from './authHelpers';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock('./authHelpers', () => ({
  getAuthToken: jest.fn(),
  getUserId: jest.fn(),
  getUserType: jest.fn(),
  getUserInfo: jest.fn(),
  storeAuthData: jest.fn(),
  emitAuthChanged: jest.fn(),
  onAuthChanged: jest.fn(),
  rememberAuthToken: jest.fn(),
}));
jest.mock('../socketService', () => ({ socketService: { disconnect: jest.fn() } }));
jest.mock('../../utils/navigationUtils', () => ({ navigateToDashboard: jest.fn() }));

/**
 * "Is there a session" is asked at launch and again by the first tabs, and its
 * answer decides whether a signed-in provider sees their account or the guest
 * catalogue. Two things went wrong with it: every failure that was not a 401
 * was reported as signed out, and every ask was its own profile request.
 */
describe('userService.isAuthenticated', () => {
  // The answer is remembered per token, so each case signs in as someone new.
  let n = 0;
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthToken.mockResolvedValue(`token-${++n}`);
    getUserType.mockResolvedValue('PROVIDER');
    getUserInfo.mockResolvedValue({ is_admin: false });
  });

  it('is signed out with no token, without asking the server', async () => {
    getAuthToken.mockResolvedValue(null);
    await expect(userService.isAuthenticated()).resolves.toMatchObject({ authenticated: false });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('reports what the server says about the account', async () => {
    apiClient.get.mockResolvedValue({ data: { type: 'PROVIDER', is_admin: true } });
    await expect(userService.isAuthenticated()).resolves.toEqual({
      authenticated: true, roleSelected: true, userType: 'PROVIDER', is_admin: true,
    });
  });

  it('only a 401 means signed out', async () => {
    apiClient.get.mockRejectedValue({ response: { status: 401 } });
    await expect(userService.isAuthenticated()).resolves.toMatchObject({ authenticated: false });
  });

  it.each([
    ['no network', { message: 'Network Error' }],
    ['a rate limit', { response: { status: 429 } }],
    ['a server error', { response: { status: 502 } }],
  ])('trusts the stored session through %s', async (_label, error) => {
    apiClient.get.mockRejectedValue(error);
    await expect(userService.isAuthenticated()).resolves.toMatchObject({
      authenticated: true, userType: 'PROVIDER', unverified: true,
    });
  });

  it('asks once for callers that arrive together or soon after', async () => {
    apiClient.get.mockResolvedValue({ data: { type: 'CUSTOMER' } });
    await Promise.all([userService.isAuthenticated(), userService.isAuthenticated()]);
    await userService.isAuthenticated();
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('does not remember a refusal', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { status: 401 } });
    await userService.isAuthenticated();
    apiClient.get.mockResolvedValue({ data: { type: 'CUSTOMER' } });
    await expect(userService.isAuthenticated()).resolves.toMatchObject({ authenticated: true });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
