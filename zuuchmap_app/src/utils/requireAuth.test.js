import { ensureAuth, isGuest } from './requireAuth';
import { getAuthToken } from '../services/api/authHelpers';
import { showErrorModal, hideErrorModal } from './errorManager';

jest.mock('../services/api/authHelpers', () => ({
  getAuthToken: jest.fn(),
  onAuthChanged: jest.fn(() => () => {}),
}));
jest.mock('./errorManager', () => ({
  showErrorModal: jest.fn(),
  hideErrorModal: jest.fn(),
}));
jest.mock('../i18n', () => ({ t: (key) => key }));

/**
 * The gate that makes guest browsing safe.
 *
 * The app used to route every unauthenticated launch to the phone screen, and
 * verification bills the USER 150₮ — so nothing could be seen without paying.
 * Now reading is open and only the four account-writing actions prompt. What
 * must hold: a signed-in user is never interrupted, a guest is never silently
 * dropped, and the prompt always offers a way to actually sign in.
 */
describe('ensureAuth', () => {
  const navigation = { navigate: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  it('lets a signed-in user through without a prompt', async () => {
    getAuthToken.mockResolvedValue('jwt-token');
    await expect(ensureAuth(navigation, 'auth.guestSave')).resolves.toBe(true);
    expect(showErrorModal).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('stops a guest and explains which action needs the account', async () => {
    getAuthToken.mockResolvedValue(null);
    await expect(ensureAuth(navigation, 'auth.guestBook')).resolves.toBe(false);

    const [title, message] = showErrorModal.mock.calls[0];
    expect(title).toBe('auth.guestTitle');
    // The reason is the caller's, not a generic "sign in to continue" — that is
    // the difference between an explanation and a wall.
    expect(message).toBe('auth.guestBook');
  });

  it('offers a route to the login screen, not just a dead acknowledgement', async () => {
    getAuthToken.mockResolvedValue(null);
    await ensureAuth(navigation, 'auth.guestSave');

    const buttons = showErrorModal.mock.calls[0][2];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].onPress).toBeUndefined(); // cancel just closes

    // The old like handler showed a warning with a single Close button: it told
    // people an account was needed and gave them no way to get one.
    buttons[1].onPress();
    expect(hideErrorModal).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('PhoneNumber');
  });

  it('defaults to a generic reason when a call site names none', async () => {
    getAuthToken.mockResolvedValue(null);
    await ensureAuth(navigation);
    expect(showErrorModal.mock.calls[0][1]).toBe('auth.loginRequired');
  });
});

describe('isGuest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is false when a token is stored and true when it is not', async () => {
    getAuthToken.mockResolvedValue('jwt-token');
    await expect(isGuest()).resolves.toBe(false);
    getAuthToken.mockResolvedValue(null);
    await expect(isGuest()).resolves.toBe(true);
  });
});
