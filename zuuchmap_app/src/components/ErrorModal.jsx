import React from 'react';
import DialogModal from './DialogModal';
import {  } from '../design/theme';
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
            default:
                return {
                    name: 'alert-circle',
                    color: colors.danger,
                    bgColor: colors.opacity.background.danger,
                };
        }
    };

    const iconConfig = getIconConfig();
    const mappedButtons = buttons?.map(btn => ({
        text: btn.text,
        onPress: btn.onPress,
        variant: btn.style === 'destructive' ? 'danger' : btn.style === 'cancel' ? 'outline' : 'primary',
        closeOnPress: btn.closeOnPress !== false,
    })) || [{ text: t('common.confirm'), onPress: onClose, variant: 'primary' }];

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

