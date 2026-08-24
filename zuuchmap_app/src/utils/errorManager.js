import i18n from '../i18n';

// --- Modal ref management ---
let modalRef = null;

export const setErrorModalRef = (ref) => { modalRef = ref; };

export const showErrorModal = (title, message, buttons, type = 'error') => {
    if (modalRef) modalRef.show(title, message, buttons, type);
};

export const hideErrorModal = () => {
    if (modalRef?.hide) modalRef.hide();
};

export const showInfoModal = (title, message, buttons) =>
    showErrorModal(title, message, buttons || [{ text: i18n.t('common.ok') }], 'info');

export const showWarningModal = (title, message, buttons) =>
    showErrorModal(title, message, buttons || [{ text: i18n.t('common.ok') }], 'warning');

export const showSuccessModal = (title, message, buttons) =>
    showErrorModal(title, message, buttons || [{ text: i18n.t('common.ok') }], 'success');

// --- Error message extraction ---
const getDefaultMessages = () => ({
    400: i18n.t('errors.badRequest'),
    401: i18n.t('errors.unauthorized'),
    404: i18n.t('errors.notFound'),
    429: i18n.t('errors.tooManyRequests'),
    500: i18n.t('errors.serverError'),
});

/**
 * True for a 401 that arrived on a request carrying no token — a query that was
 * still observed when logout cleared the session, not a failure anyone caused.
 * `apiClient` tags these; the header check covers anything that reached here
 * without passing through the interceptor.
 *
 * Screens and services that report their own errors must skip these, or logging
 * out prints an ERROR pair and pops a modal at someone who did nothing wrong.
 */
export const isPostLogoutStraggler = (error) =>
    error?.isPostLogoutStraggler === true
    || (error?.response?.status === 401 && !error?.config?.headers?.Authorization);

export const getErrorMessage = (error) => {
    const fallback = i18n.t('errors.unknown');
    if (error == null) return fallback;
    if (typeof error === 'string') return error;
    // Server rule errors carry a stable machine `code`; localize it so the
    // dialog never shows the raw (English) server message. Falls through to the
    // server message only when the code is unknown to this client.
    const code = error?.response?.data?.code;
    if (code) {
        const localized = i18n.t(`errors.codes.${code}`, { defaultValue: '' });
        if (localized) return localized;
    }
    // Throttler 429s carry no code and an English-only message — localize them.
    if (error?.response?.status === 429) return i18n.t('errors.tooManyRequests');
    if (error?.response?.data?.message) return error.response.data.message;
    if (!error?.response && error?.code === 'ECONNABORTED') return i18n.t('errors.timeout');
    if (!error?.response && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error')) return i18n.t('errors.network');
    // Locally-thrown coded errors — map to translated copy so the raw (possibly
    // wrong-language) message never reaches the UI.
    if (error?.code === 'AUTH_TOKEN_MISSING') return i18n.t('errors.authTokenMissing');
    if (error?.code === 'USER_ID_MISSING') return i18n.t('errors.unauthorized');
    if (error?.message) return error.message;
    if (error?.response?.status) return getDefaultMessages()[error.response.status] ?? fallback;
    return fallback;
};


