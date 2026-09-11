import React from 'react';
import DialogModal from './DialogModal';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const ErrorModal = ({ visible, title, message, onClose, buttons, type = 'error' }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const getIconConfig = () => {
        switch (type) {
            case 'warning':
                return {
                    name: 'warning',
                    color: colors.warning,
                    bgColor: colors.opacity.background.warning,
                };
            case 'info':
                return {
                    name: 'information-circle',
                    color: colors.info,
                    bgColor: colors.opacity.background.info,
                };
            // A list of choices, not a verdict. Skipping the icon keeps the
            // one blue in an amber app out of a plain action sheet, and stops a
            // destructive option arriving under an "information" badge.
            case 'menu':
                return { name: null, color: null, bgColor: null };
            case 'success':
                return {
                    name: 'checkmark-circle',
                    color: colors.success,
                    bgColor: colors.opacity.background.success,
                };
            default:
                return {
                    name: 'alert-circle',
                    color: colors.danger,
                    bgColor: colors.opacity.background.danger,
                };
        }
    };

    const iconConfig = getIconConfig();
    // An empty array is truthy — without the length check a caller passing `[]`
    // renders a dialog with no way out but the backdrop.
    // A button with nothing to do but close is a dismiss whether or not the
    // caller wrote `style: 'cancel'` — seven callers did not, and the guest
    // prompt showed two identical amber fills with no visible primary action.
    const mappedButtons = buttons?.length ? buttons.map(btn => {
        const dismiss = btn.style === 'cancel' || (!btn.onPress && buttons.length > 1);
        return {
            text: btn.text,
            onPress: btn.onPress,
            variant: btn.style === 'destructive' ? 'danger' : dismiss ? 'outline' : 'primary',
            closeOnPress: btn.closeOnPress !== false,
        };
    }) : [{ text: t('common.confirm'), onPress: onClose, variant: 'primary' }];

    return (
        <DialogModal
            visible={visible}
            onClose={onClose}
            title={title || t('common.error')}
            message={message}
            icon={iconConfig.name}
            iconColor={iconConfig.color}
            iconBgColor={iconConfig.bgColor}
            buttons={mappedButtons}
        />
    );
};

export default ErrorModal;

