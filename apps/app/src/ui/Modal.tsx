import { Modal as RNModal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Toaster } from './Toast';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  /** Status-tint disc above the title. */
  icon?: string;
  iconTone?: 'danger' | 'warning' | 'info';
  cancelLabel?: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Destructive confirm is a danger button; otherwise primary. */
  destructive?: boolean;
}

/** Confirm dialog shell. Only for destructive choices; everything else is a sheet or a toast. */
export function Modal({ visible, onClose, title, body, icon, iconTone = 'danger', cancelLabel, confirmLabel, onConfirm, destructive = true }: ModalProps) {
  const { colors, type, elevation, radius } = useAppTheme();
  const { t } = useTranslation();
  const [bg, fg] = { danger: [colors.statusDangerTint, colors.statusDanger], warning: [colors.statusWarningTint, colors.statusWarning], info: [colors.statusInfoTint, colors.statusInfo] }[iconTone];
  return (
    <RNModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgScrim }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          accessibilityViewIsModal
          style={[elevation.lg, { width: '100%', maxWidth: 360, gap: 16, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 20, borderRadius: radius.modal, backgroundColor: colors.bgSurfaceRaised }]}
        >
          {icon ? (
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
              <Icon name={icon} size={22} color={fg} />
            </View>
          ) : null}
          <Text accessibilityRole="header" style={[type.h3, { color: colors.textPrimary }]}>{title}</Text>
          {body ? <Text style={[type.body, { color: colors.textSecondary }]}>{body}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Button label={cancelLabel ?? t('common.cancel')} variant="outline" size="medium" onPress={onClose} />
            <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} size="medium" onPress={onConfirm} />
          </View>
        </View>
      </View>
      <Toaster placement="top" />
    </RNModal>
  );
}
