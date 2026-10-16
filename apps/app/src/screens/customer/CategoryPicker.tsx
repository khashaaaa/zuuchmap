import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { categoryColor } from '@zuuchmap/tokens';
import { themedStyles, useAppTheme } from '../../design/theme';
import { setBrowse } from '../../lib/browse';
import { useCategories, useFamilies, useStats } from '../../lib/queries';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SearchBar } from '../../ui/SearchBar';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 8 },
  group: { ...t.type.overline, color: t.colors.textSecondary, paddingTop: 12 },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tile: { width: 40, height: 40, borderRadius: t.radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { ...t.type.bodyBold, color: t.colors.textPrimary },
  sub: { ...t.type.small, color: t.colors.textSecondary },
  rule: { height: 1, marginLeft: 64, backgroundColor: t.colors.borderSubtle },
  note: { ...t.type.small, color: t.colors.textSecondary, paddingTop: 8 },
}));

const goBrowse = (nav: Nav) => nav.navigate('Tabs', { screen: 'browse' });

/** A6: every category by family with counts; a category with subcategories continues to A7. */
export function CategoryPicker() {
  const s = useStyles();
  const { colors, scheme } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const cats = useCategories();
  const fams = useFamilies();
  const stats = useStats();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const all = cats.data ?? [];
    return (fams.data ?? [])
      .map((f) => ({ f, rows: all.filter((c) => f.categories.includes(c.key)).filter((c) => !needle || c.label.toLowerCase().includes(needle) || c.subcategories.some((x) => x.label.toLowerCase().includes(needle))) }))
      .filter((g) => g.rows.length > 0);
  }, [cats.data, fams.data, needle]);

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('customer.picker.category')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <SearchBar value={q} onChangeText={setQ} placeholder={t('customer.picker.search')} />
        {groups.length === 0 && !cats.isPending ? <EmptyState title={t('filter.searchNoResults')} /> : null}
        {groups.map(({ f, rows }) => (
          <View key={f.key} style={{ gap: 8 }}>
            <Text style={s.group} accessibilityRole="header">{f.label}</Text>
            <View style={s.card}>
              {rows.map((c, i) => {
                const fill = categoryColor(c.key, scheme).fill;
                const count = stats.data?.categories.find((x) => x.key === c.key)?.count ?? 0;
                return (
                  <View key={c.key}>
                    {i > 0 ? <View style={s.rule} /> : null}
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`${c.label}. ${t('customer.picker.subs', { subs: c.subcategories.length, count })}`}
                      onPress={() => {
                        setBrowse({ category: c.key, family: undefined, subcategory: undefined, attrs: {}, price_unit: undefined, price_min: undefined, price_max: undefined });
                        if (c.subcategories.length > 0) nav.navigate('SubcategoryPicker', { category: c.key });
                        else goBrowse(nav);
                      }}
                      contentStyle={s.row}
                    >
                      <View style={[s.tile, { backgroundColor: fill + '29' }]}>
                        <Icon name={c.icon} categoryKey={c.key} size={22} color={fill} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.name} numberOfLines={1}>{c.label}</Text>
                        <Text style={s.sub} numberOfLines={1}>{t('customer.picker.subs', { subs: c.subcategories.length, count })}</Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** A7: a subcategory narrows the search at once; "Бүгд" keeps the whole category. */
export function SubcategoryPicker() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SubcategoryPicker'>>();
  const cats = useCategories();
  const stats = useStats();
  const cat = cats.data?.find((c) => c.key === params.category);
  const count = stats.data?.categories.find((x) => x.key === params.category)?.count ?? 0;

  const pick = (sub?: string) => {
    setBrowse({ category: params.category, subcategory: sub });
    goBrowse(nav);
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={cat?.label ?? ''} subtitle={t('customer.picker.subcategory', { count: cat?.subcategories.length ?? 0 })} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <PressableScale accessibilityRole="button" onPress={() => pick(undefined)} contentStyle={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{t('customer.picker.all')}</Text>
              <Text style={s.sub}>{t('customer.picker.count', { count })}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
          </PressableScale>
          {(cat?.subcategories ?? []).map((sub) => (
            <View key={sub.value}>
              <View style={s.rule} />
              <PressableScale accessibilityRole="button" onPress={() => pick(sub.value)} contentStyle={s.row}>
                <Text style={[s.name, { flex: 1 }]}>{sub.label}</Text>
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </PressableScale>
            </View>
          ))}
        </View>
        <Text style={s.note}>{t('customer.picker.note')}</Text>
      </ScrollView>
    </View>
  );
}
