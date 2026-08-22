import ErrorModal from '../components/ErrorModal';
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

export const showErrorAlert = (title, error, options = {}) => {
    const resolvedTitle = title ?? i18n.t('common.error');
    const status = error?.response?.status;
    const overrides = {
        400: options.message400,
        401: options.message401,
        404: options.message404,
        429: options.message429,
        500: options.message500,
    };
    const message = (status && overrides[status]) ? overrides[status] : getErrorMessage(error);
    showErrorModal(resolvedTitle, message, options.buttons || [{ text: i18n.t('common.ok') }]);
};

