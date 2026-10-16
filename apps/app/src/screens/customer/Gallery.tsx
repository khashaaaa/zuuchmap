import { useState } from 'react';
import { Dimensions, FlatList, Image, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { dark } from '@zuuchmap/tokens';
import { themedStyles } from '../../design/theme';
import type { Nav, RootStackParamList } from '../../nav';
import { IconButton } from '../../ui/IconButton';

const useStyles = themedStyles((t) => ({
  count: { ...t.type.labelStrong, color: dark.textPrimary },
}));

/** B5: full-screen photos paged horizontally on a black ground (both themes). */
export function Gallery() {
  const s = useStyles();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Gallery'>>();
  const { width } = Dimensions.get('window');
  const [index, setIndex] = useState(params.index);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={params.images}
        horizontal
        pagingEnabled
        initialScrollIndex={params.index}
        getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(u, i) => `${i}${u}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height: '100%' }} resizeMode="contain" accessibilityLabel={params.title} accessibilityIgnoresInvertColors />}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 8, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="x" label={t('common.close')} variant="media" onPress={() => nav.goBack()} />
        <Text style={s.count} accessibilityLiveRegion="polite">{t('customer.detail.counter', { index: index + 1, total: params.images.length })}</Text>
      </View>
    </View>
  );
}
