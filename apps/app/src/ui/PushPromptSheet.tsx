import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { canAskNow, requestPermission, snoozePrompt } from '../lib/push';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type Listener = (reason: string) => void;
let listener: Listener | null = null;

/** Ask for push behind the rationale sheet, right after something the user will want an answer to. A no-op unless the OS permission is still undetermined and "later" is not recent. */
export function askPush(reasonKey: string, delayMs = 450): void {
  void canAskNow().then((ok) => {
    if (ok) setTimeout(() => listener?.(reasonKey), delayMs);
  });
}

/** Mounted once under the navigator. */
export function PushPromptHost() {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    listener = setReason;
    return () => {
      listener = null;
    };
  }, []);
  const close = () => setReason(null);
  return (
    <BottomSheet
      visible={!!reason}
      onClose={() => {
        snoozePrompt();
        close();
      }}
      title={t('push.promptTitle')}
      footerLabel={t('push.promptEnable')}
      onFooter={() => {
        close();
        void requestPermission();
      }}
    >
      <Text style={[type.body, { color: colors.textSecondary }]}>{reason ? t(reason) : ''}</Text>
      <Button
        label={t('push.promptLater')}
        variant="outline"
        fullWidth
        onPress={() => {
          snoozePrompt();
          close();
        }}
      />
    </BottomSheet>
  );
}
