import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@zuuchmap/core';
import { themedStyles, useAppTheme, type ThemeMode } from '../design/theme';
import { AppHeader } from '../ui/AppHeader';
import { Banner, NoticeSlot } from '../ui/Banner';
import { BottomSheet } from '../ui/BottomSheet';
import { DateRangeCalendar, type DateRange } from '../ui/DateRangeCalendar';
import { EmptyState } from '../ui/EmptyState';
import { InboxRow } from '../ui/InboxRow';
import { ListingActionBar } from '../ui/ListingActionBar';
import { ListingCard } from '../ui/ListingCard';
import { ListingHealthRing } from '../ui/ListingHealthRing';
import { MapPin } from '../ui/MapPin';
import { MessageBubble } from '../ui/MessageBubble';
import { Modal } from '../ui/Modal';
import { MyListingRow } from '../ui/MyListingRow';
import { NOTIFICATION_TYPES, NotificationRow } from '../ui/NotificationRow';
import { SellerCard } from '../ui/SellerCard';
import { SheetGrabber } from '../ui/SheetGrabber';
import { SkeletonListingRow } from '../ui/SkeletonListingRow';
import { StatTile } from '../ui/StatTile';
import { TabBar, type TabPreset } from '../ui/TabBar';
import { TaskCard } from '../ui/TaskCard';
import { Toast, useToast } from '../ui/Toast';
import { WizardSteps } from '../ui/WizardSteps';
import { Avatar } from '../ui/Avatar';
import { Button, type ButtonVariant } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Chip } from '../ui/Chip';
import { CountBadge } from '../ui/CountBadge';
import { FeaturedMark } from '../ui/FeaturedMark';
import { Icon } from '../ui/Icon';
import { IconButton, type IconButtonVariant } from '../ui/IconButton';
import { Radio } from '../ui/Radio';
import { Rating } from '../ui/Rating';
import { SearchBar } from '../ui/SearchBar';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Select } from '../ui/Select';
import { STATUSES, StatusBadge } from '../ui/StatusBadge';
import { Switch } from '../ui/Switch';
import { TextField } from '../ui/TextField';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, gap: t.spacing.section },
  section: { gap: t.spacing.md },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  cap: { ...t.type.small, color: t.colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md },
  card: { padding: t.spacing.cardPadding, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, gap: t.spacing.md },
  onPhoto: { padding: t.spacing.lg, borderRadius: t.radius.card, backgroundColor: t.colors.bgInverse, flexDirection: 'row', gap: t.spacing.md },
  elev: { ...t.elevation.md, padding: t.spacing.lg, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
}));

function Section({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <Text style={s.h} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function Cap({ children }: { children: string }) {
  return <Text style={useStyles().cap}>{children}</Text>;
}

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'danger'];
const ICON_VARIANTS: IconButtonVariant[] = ['surface', 'ghost', 'primary', 'media'];

export function Kit() {
  const s = useStyles();
  const { mode, setMode, colors } = useAppTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState('a');
  const [sw, setSw] = useState(true);
  const [seg, setSeg] = useState<'list' | 'map'>('list');
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [sheetText, setSheetText] = useState('');
  const [tabs, setTabs] = useState<Record<TabPreset, string>>({ customer: 'browse', provider: 'home', admin: 'browse' });
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const noop = () => undefined;
  const now = new Date();
  const ago = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const old = new Date(now.getTime() - 3 * 86400_000).toISOString();
  const price = { amount: 450000, unit: 'DAY' };
  const isBooked = (d: Date) => d.getDate() >= 20 && d.getDate() <= 22;

  const modes: ThemeMode[] = ['system', 'light', 'dark'];
  const modeLabel = { system: t('kit.theme.system'), light: t('kit.theme.light'), dark: t('kit.theme.dark') };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="Theme · Locale">
        <SegmentedControl<ThemeMode>
          segments={modes.map((m) => ({ value: m, label: modeLabel[m] }))}
          value={mode}
          onChange={setMode}
        />
        <View style={s.row}>
          {LOCALES.map((l) => (
            <Chip key={l} label={l.toUpperCase()} selected={i18n.language === l} onPress={() => void i18n.changeLanguage(l)} />
          ))}
        </View>
      </Section>

      <Section title="Button">
        {(['large', 'medium'] as const).map((size) => (
          <View key={size} style={s.card}>
            <Cap>{size}</Cap>
            {VARIANTS.map((v) => (
              <View key={v} style={s.row}>
                <Button label={v} variant={v} size={size} />
                <Button label="Pressed" variant={v} size={size} forcePressed />
                <Button label="Disabled" variant={v} size={size} disabled />
                <Button label="Icon" variant={v} size={size} icon="plus" />
                <Button label="Loading" variant={v} size={size} loading />
              </View>
            ))}
          </View>
        ))}
      </Section>

      <Section title="IconButton">
        {(['large', 'medium'] as const).map((size) => (
          <View key={size} style={s.row}>
            {ICON_VARIANTS.map((v) => (
              <View key={v} style={v === 'media' ? s.onPhoto : undefined}>
                <IconButton icon="heart" label={`${v} ${size}`} variant={v} size={size} />
              </View>
            ))}
            <IconButton icon="heart" label="filled" filled size={size} />
            <IconButton icon="x" label="disabled" variant="surface" size={size} disabled />
          </View>
        ))}
      </Section>

      <Section title="Chip">
        <View style={s.row}>
          <Chip label="Filter" />
          <Chip label="Selected" selected />
          <Chip label="Pressed" forcePressed />
          <Chip label="Category" type="category" categoryKey="machineryrent" icon="truck" />
          <Chip label="Selected" type="category" categoryKey="machineryrent" icon="truck" selected />
          <Chip label="Removable" type="removable" />
          <Chip label="Unknown icon" type="category" categoryKey="sos" icon="hammer-outline" />
        </View>
      </Section>

      <Section title="Status badge">
        <View style={s.row}>
          {STATUSES.map((st) => (
            <StatusBadge key={st} status={st} />
          ))}
        </View>
      </Section>

      <Section title="Avatar · Count · Featured · Rating">
        <View style={s.row}>
          <Avatar size="small" name="Бат Болд" />
          <Avatar size="medium" name="Бат Болд" />
          <Avatar size="large" name="Бат Болд" />
          <Avatar size="small" kind="company" />
          <Avatar size="medium" kind="company" />
          <Avatar size="large" kind="company" />
        </View>
        <View style={s.row}>
          <CountBadge count={3} />
          <CountBadge count={42} />
          <CountBadge count={120} />
          <FeaturedMark />
        </View>
        <View style={s.row}>
          <Rating value={4.8} />
          <Rating value={3} />
        </View>
      </Section>

      <Section title="TextField">
        <View style={s.card}>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Placeholder" helper="Helper text" icon="user" validate={(v) => (v.trim() ? null : t('ui.required'))} />
          <TextField label="Phone" value={phone} onChangeText={setPhone} inputMode="tel" placeholder="8000 0000" />
          <TextField label="Focused" value="Value" onChangeText={() => undefined} forceFocused />
          <TextField label="Error" value="Value" onChangeText={() => undefined} error={t('ui.emailInvalid')} />
          <TextField label="Disabled" value="Value" onChangeText={() => undefined} helper="Helper text" disabled />
        </View>
      </Section>

      <Section title="SearchBar">
        <SearchBar value={query} onChangeText={setQuery} />
        <SearchBar value="" onChangeText={() => undefined} forceFocused />
        <SearchBar value="Кран" onChangeText={() => undefined} />
      </Section>

      <Section title="Select">
        <Select
          label="Select"
          placeholder={t('kit.pickDistrict')}
          value={district}
          onChange={setDistrict}
          options={['Баянзүрх', 'Сүхбаатар', 'Чингэлтэй', 'Хан-Уул'].map((d) => ({ value: d, label: d }))}
        />
        <Select placeholder={t('kit.pickDistrict')} value="a" onChange={() => undefined} options={[{ value: 'a', label: 'Сүхбаатар' }]} />
        <Select placeholder={t('kit.pickDistrict')} value={null} onChange={() => undefined} options={[]} disabled />
      </Section>

      <Section title="Checkbox · Radio · Switch">
        <View style={s.card}>
          <Checkbox label="On" checked={check} onChange={setCheck} />
          <Checkbox label="Off" checked={false} />
          <Checkbox label="Indeterminate" checked="indeterminate" />
          <Radio label="Option A" selected={radio === 'a'} onPress={() => setRadio('a')} />
          <Radio label="Option B" selected={radio === 'b'} onPress={() => setRadio('b')} />
          <View style={s.row}>
            <Switch label="On" value={sw} onValueChange={setSw} />
            <Switch label="Off" value={false} />
          </View>
        </View>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          segments={[{ value: 'list', label: t('customer.browse.list'), icon: 'list' }, { value: 'map', label: t('customer.browse.map'), icon: 'map' }]}
          value={seg}
          onChange={setSeg}
        />
      </Section>

      <Section title="Toast">
        <Toast message="Хадгаллаа" kind="success" />
        <Toast message="Ачаалж чадсангүй" kind="error" actionLabel={t('common.retry')} />
        <Toast message="Зар устгагдлаа" kind="info" actionLabel={t('ui.undo')} />
        <View style={s.row}>
          <Button label="Success" size="medium" variant="outline" onPress={() => toast.show({ message: 'Хадгаллаа', kind: 'success' })} />
          <Button label="Error + action" size="medium" variant="outline" onPress={() => toast.show({ message: 'Ачаалж чадсангүй', kind: 'error', actionLabel: t('common.retry'), onAction: noop })} />
        </View>
      </Section>

      <Section title="Banner · NoticeSlot">
        <Banner tone="info" title={t('kit.notice.pushOff.title')} actionLabel={t('kit.notice.pushOff.action')} />
        <Banner tone="warning" title={t('kit.notice.quota.title')} body={t('kit.notice.quota.body', { used: 4, total: 5 })} actionLabel={t('kit.notice.quota.action')} />
        <Banner tone="offline" title={t('kit.notice.offline.title')} body={t('kit.notice.offline.body')} />
        <Banner tone="danger" title={t('kit.notice.rejected.title')} actionLabel={t('common.edit')} />
        <Cap>NoticeSlot: offline + quota + notifications off, only offline wins</Cap>
        <NoticeSlot offline quota={{ used: 4, total: 5, onRenew: noop }} notificationsOff={{ onEnable: noop }} />
      </Section>

      <Section title="EmptyState">
        <View style={s.card}>
          <EmptyState icon="search" title="Илэрц олдсонгүй" body="“кран”" actionLabel="Шүүлтүүр арилгах" />
          <EmptyState icon="bookmark" title="Хадгалсан зар алга" actionLabel="Зар хайх" actionVariant="secondary" />
          <EmptyState icon="refresh-cw" title="Ачаалж чадсангүй" body="Сүлжээгээ шалгаад дахин оролдоно уу" actionLabel={t('common.retry')} />
        </View>
      </Section>

      <Section title="WizardSteps">
        <WizardSteps steps={[t('kit.wizard.s1'), t('kit.wizard.s2'), t('kit.wizard.s3'), t('kit.wizard.s4'), t('kit.wizard.s5')]} current={2} />
      </Section>

      <Section title="TabBar">
        {(['customer', 'provider', 'admin'] as const).map((p) => (
          <View key={p} style={p === 'provider' ? { marginTop: 28 } : undefined}>
          <TabBar
            preset={p}
            activeKey={tabs[p]}
            onSelect={(k) => setTabs({ ...tabs, [p]: k })}
            counts={{ messages: 3 }}
            quota={p === 'provider' ? { used: 2, total: 3 } : undefined}
          />
          </View>
        ))}
      </Section>

      <Section title="AppHeader">
        <AppHeader topInset={false} variant="root" title="Нүүр" action={{ icon: 'bell', label: 'Bell', onPress: noop }} />
        <AppHeader topInset={false} variant="pushed" title="Зар" subtitle="2 / 6" onBack={noop} action={{ icon: 'more-horizontal', label: t('common.more'), onPress: noop }} />
        <AppHeader topInset={false} variant="brand" action={{ icon: 'bell', label: 'Bell', onPress: noop }} />
        <AppHeader topInset={false} variant="chat" name="Хүнд Техник" replyHours={2} onBack={noop} action={{ icon: 'phone', label: t('kit.action.call'), onPress: noop }} />
      </Section>

      <Section title="ListingCard">
        <ListingCard title="Экскаватор CAT 320, жолоочтой түрээс, Улаанбаатар дотор" categoryKey="machineryrent" categoryIcon="truck" meta="Хан-Уул · 2 цагийн өмнө" price={price} saved={saved} onToggleSave={() => setSaved(!saved)} featured />
        <ListingCard title="Кран 25 тонн" categoryKey="machineryrent" categoryIcon="hammer-outline" meta="Баянзүрх · өчигдөр" price={price} dates availability="available" total="3 өдөр · 1,350,000₮" />
        <ListingCard title="Цемент 50кг" categoryKey="materialstore" categoryIcon="package" meta="Сүхбаатар" price={{ amount: 18000, unit: 'TOTAL' }} dates availability="busy" total="1 өдөр" />
        <ListingCard layout="grid" title="Экскаватор CAT 320, жолоочтой түрээс" categoryLabel="Механизм түрээс" categoryKey="machineryrent" categoryIcon="truck" meta="Хан-Уул · 2 цагийн өмнө" price={price} featured saved={saved} onToggleSave={() => setSaved(!saved)} />
        <SkeletonListingRow />
      </Section>

      <Section title="MyListingRow">
        <MyListingRow title="Экскаватор CAT 320, жолоочтой түрээс" status="live" categoryKey="machineryrent" categoryIcon="truck" price={price} meta="128 үзэлт · 6 хадгалсан · 3 хоног үлдсэн" action={{ label: t('kit.featured'), icon: 'star', onPress: noop }} onMore={noop} />
        <MyListingRow title="Цемент 50кг" status="rejected" categoryKey="materialstore" price={{ amount: 18000, unit: 'TOTAL' }} rejectionNote="Үнэ буруу эсвэл алга" onMore={noop} />
      </Section>

      <Section title="ListingActionBar · MapPin · SheetGrabber">
        {(['book', 'call', 'sos'] as const).map((m) => (
          <View key={m} style={{ height: 96, justifyContent: 'flex-end' }}>
            <ListingActionBar mode={m} price={price} />
          </View>
        ))}
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <MapPin kind="price" label="450,000₮" />
          <MapPin kind="selected" label="450,000₮" />
          <MapPin kind="cluster" label="12" />
          <SheetGrabber />
        </View>
      </Section>

      <Section title="Messages">
        <View style={s.card}>
          <MessageBubble direction="in" text="Сайн байна уу, маргааш боломжтой юу?" time={ago} />
          <MessageBubble direction="out" text="Боломжтой." time={ago} status="sending" />
          <MessageBubble direction="out" text="Хаяг илгээнэ үү." time={ago} status="sent" />
          <MessageBubble direction="out" text="Ойлголоо." time={ago} status="read" />
        </View>
        <View style={s.card}>
          <InboxRow name="Хүнд Техник" listing="Экскаватор CAT 320" preview="Маргааш 9 цагт очино" time={ago} unread={2} />
          <InboxRow name="Бат Болд" listing="Кран 25 тонн" preview="Баярлалаа" time={old} />
        </View>
      </Section>

      <Section title="NotificationRow">
        <View style={s.card}>
          {NOTIFICATION_TYPES.map((n, i) => (
            <NotificationRow key={n} type={n} unread={i % 2 === 0} text="Таны зар зөвшөөрөгдлөө" time="2 цагийн өмнө" />
          ))}
        </View>
      </Section>

      <Section title="TaskCard · StatTile · SellerCard · HealthRing">
        <TaskCard type="request" title="3 захиалгын хүсэлт" subtitle="Хамгийн эртнийх 2 цагийн өмнө" actionLabel="Харах" />
        <TaskCard type="rejected" title="Зар татгалзсан" subtitle="Үнэ буруу эсвэл алга" actionLabel="Засах" />
        <TaskCard type="expiring" title="2 зар 3 хоногт дуусна" subtitle="Сунгавал хайлтад үлдэнэ" actionLabel="Сунгах" />
        <View style={s.row}>
          <StatTile icon="eye" label="Үзэлт" value="1,248" delta={{ text: '+18% өмнөх 7 хоногоос', trend: 'up' }} />
          <StatTile icon="bookmark" label="Хадгалсан" value="64" delta={{ text: 'Өмнөхтэй адил', trend: 'flat' }} />
        </View>
        <SellerCard name="Хүнд Техник ХХК" verified meta="2024.03-оос гишүүн · 38 ажил" rating={{ value: 4.8, count: 21 }} replyHours={2} />
        <View style={s.row}>
          <ListingHealthRing percent={72} />
          <ListingHealthRing percent={40} size={56} />
          <ListingHealthRing percent={90} size={36} />
        </View>
      </Section>

      <Section title="DateRangeCalendar">
        <DateRangeCalendar value={range} onChange={setRange} isBooked={isBooked} />
      </Section>

      <Section title="Modal · BottomSheet">
        <View style={s.row}>
          <Button label="Modal" variant="outline" size="medium" onPress={() => setModal(true)} />
          <Button label="BottomSheet" variant="outline" size="medium" onPress={() => setSheet(true)} />
        </View>
      </Section>
      <Modal visible={modal} onClose={() => setModal(false)} icon="trash-2" title={t('common.delete')} body={t('common.irreversible')} confirmLabel={t('common.delete')} onConfirm={() => setModal(false)} />
      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={t('nav.browse')}
        secondaryLabel={t('common.clear')}
        onSecondary={() => setSheetText('')}
        footerLabel={t('common.apply')}
        onFooter={() => setSheet(false)}
      >
        <TextField label="Name" value={sheetText} onChangeText={setSheetText} placeholder="Placeholder" />
        <Checkbox label="On" checked={check} onChange={setCheck} />
      </BottomSheet>

      <Section title="Icon · Elevation">
        <View style={s.row}>
          {['search', 'bell', 'package', 'not-a-real-icon'].map((n) => (
            <Icon key={n} name={n} categoryKey="transport" size={24} color={colors.iconPrimary} />
          ))}
        </View>
        <View style={s.elev}>
          <Cap>elevation/md</Cap>
        </View>
      </Section>
    </ScrollView>
  );
}
