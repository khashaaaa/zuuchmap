import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { LOCALES } from '@zuuchmap/core';
import { useThemeStore, type Theme } from '@/lib/theme';
import { Avatar } from '@/ui/Avatar';
import { Button, type ButtonStyle } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { CountBadge } from '@/ui/CountBadge';
import { FeaturedMark } from '@/ui/FeaturedMark';
import { Icon, SHIPPED_ICONS } from '@/ui/Icon';
import { IconButton, type IconButtonStyle } from '@/ui/IconButton';
import { Radio } from '@/ui/Radio';
import { Rating } from '@/ui/Rating';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Select } from '@/ui/Select';
import { STATUSES, StatusBadge } from '@/ui/StatusBadge';
import { Switch } from '@/ui/Switch';
import { TextField } from '@/ui/TextField';
import { AppHeader } from '@/ui/AppHeader';
import { Banner, NoticeSlot, type NoticeKind } from '@/ui/Banner';
import { BottomSheet } from '@/ui/BottomSheet';
import { DateRangeCalendar, type DateRange } from '@/ui/DateRangeCalendar';
import { DesktopHeader, DesktopPageHeader, DesktopWizardHeader } from '@/ui/DesktopHeader';
import { EmptyState } from '@/ui/EmptyState';
import { InboxRow } from '@/ui/InboxRow';
import { ListingActionBar } from '@/ui/ListingActionBar';
import { ListingCard } from '@/ui/ListingCard';
import { ListingHealthRing } from '@/ui/ListingHealthRing';
import { MapPin } from '@/ui/MapPin';
import { MessageBubble } from '@/ui/MessageBubble';
import { Modal } from '@/ui/Modal';
import { MyListingRow } from '@/ui/MyListingRow';
import { NotificationRow, type NotificationType } from '@/ui/NotificationRow';
import { SellerCard } from '@/ui/SellerCard';
import { SheetGrabber } from '@/ui/SheetGrabber';
import { AdminSidebar, ProviderSidebar, SidebarItem } from '@/ui/Sidebar';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { StatTile } from '@/ui/StatTile';
import { AdminTabBar, CustomerTabBar, ProviderTabBar, QuotaMeter, TabBarItem } from '@/ui/TabBar';
import { TaskCard } from '@/ui/TaskCard';
import { Toast } from '@/ui/Toast';
import { Toaster } from '@/ui/Toaster';
import { useToast } from '@/lib/toast';
import { WizardSteps } from '@/ui/WizardSteps';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card bg-bg-surface p-5 ring-1 ring-border-subtle">
      <h2 className="text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-caption text-text-secondary">{label}</p>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const THEMES: Theme[] = ['light', 'dark', 'system'];
const BUTTON_STYLES: ButtonStyle[] = ['primary', 'secondary', 'outline', 'danger'];
const ICON_STYLES: IconButtonStyle[] = ['surface', 'ghost', 'primary', 'media'];
const NOOP = () => undefined;

const NOTIFICATION_TYPES: [NotificationType, string][] = [
  ['booking', 'notifications.bookingRequested'], ['approved', 'notifications.postApproved'], ['rejected', 'notifications.postRejected'],
  ['expiring', ''], ['savedSearch', 'savedSearch.title'], ['review', 'review.title'], ['report', 'notifications.reportCreated'], ['message', 'notifications.newMessage'],
];
const AGO = Date.now() - 2 * 3600_000;
const pad2 = (n: number) => String(n).padStart(2, '0');
const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function Phone({ children, className }: { children: ReactNode; className?: string }) {
  // Up to 390 px wide (the full gallery width on a phone, edge to edge).
  return <div className={`-mx-5 max-w-[390px] overflow-hidden rounded-card ring-1 ring-border-subtle sm:mx-0 ${className ?? ''}`}>{children}</div>;
}

export function Kit() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const [params] = useSearchParams();
  const urlTheme = params.get('theme');

  useEffect(() => {
    if (urlTheme === 'light' || urlTheme === 'dark') setTheme(urlTheme, false);
  }, [urlTheme, setTheme]);

  const [q, setQ] = useState('');
  const [heroQ, setHeroQ] = useState('');
  const [filledQ, setFilledQ] = useState('Экскаватор');
  const [chipOn, setChipOn] = useState(true);
  const [sel, setSel] = useState<string | undefined>();
  const [boxes, setBoxes] = useState({ a: false, b: true });
  const [radio, setRadio] = useState('b');
  const [sw, setSw] = useState({ off: false, on: true });
  const [seg, setSeg] = useState<'list' | 'map'>('list');
  const toast = useToast();
  const demo = params.get('open');
  const [modalOpen, setModalOpen] = useState(demo === 'modal');
  const [sheetOpen, setSheetOpen] = useState(demo === 'sheet');
  const [range, setRange] = useState<DateRange>(demo === 'range' ? { start: dayKey(1), end: dayKey(4) } : {});
  const [notices, setNotices] = useState<Record<NoticeKind, boolean>>({ offline: false, rejected: false, quota: true, pushOff: true });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (demo === 'toast') {
      toast.error('Ачаалж чадсангүй', { label: 'Дахин оролдох', onClick: NOOP });
    }
  }, [demo, toast]);

  const options = [
    { value: 'UB', label: 'Улаанбаатар' },
    { value: 'DA', label: 'Дархан-Уул' },
    { value: 'ER', label: 'Эрдэнэт' },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-5">
      <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <h1 className="text-h2">Zuuchmap kit</h1>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={(v) => setTheme(v)}
            segments={THEMES.map((v) => ({ value: v, label: v }))}
            className="w-64"
          />
          <SegmentedControl
            label="Locale"
            value={i18n.language === 'en' ? 'en' : 'mn'}
            onChange={(v) => void i18n.changeLanguage(v)}
            segments={LOCALES.filter((l) => l === 'mn' || l === 'en').map((v) => ({ value: v, label: v }))}
            className="w-40"
          />
        </div>
      </header>

      <Section title="Button">
        {(['large', 'medium'] as const).map((size) =>
          BUTTON_STYLES.map((v) => (
            <Row key={`${size}${v}`} label={`${v} / ${size}`}>
              <Button variant={v} size={size}>Захиалах</Button>
              <Button variant={v} size={size} pressed>Pressed</Button>
              <Button variant={v} size={size} disabled>Disabled</Button>
              <Button variant={v} size={size} icon="plus">Нэмэх</Button>
              <Button variant={v} size={size} loading>Loading</Button>
            </Row>
          )),
        )}
      </Section>

      <Section title="IconButton">
        {(['large', 'medium'] as const).map((size) => (
          <Row key={size} label={size}>
            {ICON_STYLES.map((v) => (
              <span key={v} className={v === 'media' ? 'rounded-card bg-bg-inverse p-2' : undefined}>
                <IconButton icon="heart" label="Хадгалах" variant={v} size={size} />
              </span>
            ))}
            <IconButton icon="heart" label="Хадгалах" size={size} pressed />
            <IconButton icon="heart" label="Хадгалах" size={size} disabled />
          </Row>
        ))}
      </Section>

      <Section title="Chip">
        <Row label="filter">
          <Chip label="Бүгд" selected={chipOn} onClick={() => setChipOn(!chipOn)} />
          <Chip label="Шинэ" selected={!chipOn} onClick={() => setChipOn(!chipOn)} />
        </Row>
        <Row label="category (colour from category-text/*)">
          <Chip type="category" label="Машин түрээс" icon="truck" categoryKey="vehiclerent" />
          <Chip type="category" label="Ажлын байр" icon="briefcase" categoryKey="jobvacancy" />
          <Chip type="category" label="Ангилал" icon="legacy-ionicon" categoryKey="toolrent" selected />
        </Row>
        <Row label="removable">
          <Chip type="removable" label="Улаанбаатар" onRemove={NOOP} />
          <Chip type="removable" label="Экскаватор" onRemove={NOOP} />
        </Row>
      </Section>

      <Section title="StatusBadge">
        <Row>{STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</Row>
      </Section>

      <Section title="Avatar / CountBadge / FeaturedMark / Rating">
        <Row label="initials small / medium / large">
          <Avatar name="Бат Болд" size="small" />
          <Avatar name="Бат Болд" size="medium" />
          <Avatar name="Бат Болд" size="large" />
        </Row>
        <Row label="company">
          <Avatar type="company" size="small" />
          <Avatar type="company" size="medium" />
          <Avatar type="company" size="large" />
        </Row>
        <Row label="count">
          <CountBadge count={3} />
          <CountBadge count={42} />
          <CountBadge count={120} />
        </Row>
        <Row label="featured / rating">
          <FeaturedMark />
          <Rating value={4.8} />
          <Rating value={3} />
        </Row>
      </Section>

      <Section title="TextField">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Утасны дугаар" placeholder="8800 0000" icon="phone" inputMode="tel" helper="8 оронтой дугаар" />
          <TextField label="Focused" focused placeholder="Утга" />
          <TextField label="Filled" defaultValue="99112233" inputMode="tel" />
          <TextField label="Error" defaultValue="991" error="Утасны дугаар дутуу байна" />
          <TextField label="Disabled" disabled defaultValue="Засах боломжгүй" helper="Түгжигдсэн" />
        </div>
      </Section>

      <Section title="SearchBar">
        <SearchBar value={q} onChange={setQ} />
        <SearchBar value="" onChange={NOOP} focused />
        <SearchBar value={filledQ} onChange={setFilledQ} />
        <SearchBar variant="hero" value={heroQ} onChange={setHeroQ} />
      </Section>

      <Section title="Select">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Аймаг" options={options} value={sel} onChange={setSel} placeholder={t('kit.pickDistrict')} />
          <Select label="Filled" options={options} value="DA" onChange={NOOP} />
          <Select label="Disabled" options={options} onChange={NOOP} placeholder={t('kit.pickDistrict')} disabled />
        </div>
      </Section>

      <Section title="Checkbox / Radio / Switch / Segmented">
        <Row label="checkbox off / on / indeterminate / disabled">
          <Checkbox label="Нэг" checked={boxes.a} onChange={(a) => setBoxes({ ...boxes, a })} />
          <Checkbox label="Хоёр" checked={boxes.b} onChange={(b) => setBoxes({ ...boxes, b })} />
          <Checkbox label="Гурав" checked="indeterminate" />
          <Checkbox label="Идэвхгүй" checked disabled />
        </Row>
        <Row label="radio">
          <Radio name="r" value="a" label="Өдрөөр" checked={radio === 'a'} onChange={setRadio} />
          <Radio name="r" value="b" label="Цагаар" checked={radio === 'b'} onChange={setRadio} />
          <Radio name="r" value="c" label="Идэвхгүй" checked={false} disabled />
        </Row>
        <Row label="switch off / on / disabled">
          <Switch label="Мэдэгдэл" checked={sw.off} onChange={(off) => setSw({ ...sw, off })} />
          <Switch label="Мэдэгдэл" checked={sw.on} onChange={(on) => setSw({ ...sw, on })} />
          <Switch label="Идэвхгүй" checked={false} onChange={NOOP} disabled />
        </Row>
        <Row label="segmented">
          <SegmentedControl
            label="View"
            value={seg}
            onChange={setSeg}
            className="w-80 max-w-full"
            segments={[
              { value: 'list', label: t('customer.browse.list'), icon: 'list' },
              { value: 'map', label: t('customer.browse.map'), icon: 'map' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Toast / Toaster">
        <p className="text-caption text-text-secondary">Always the dark palette. The host sits bottom on phones, top-right from md.</p>
        <div className="flex flex-col items-start gap-3">
          <Toast tone="success" message={t('kit.status.live')} />
          <Toast tone="error" message="Ачаалж чадсангүй" action={{ label: 'Дахин оролдох', onClick: NOOP }} />
          <Toast tone="info" message={t('nav.saved')} action={{ label: 'Буцаах', onClick: NOOP }} />
        </div>
        <Row label="live (4 s, longer with an action)">
          <Button size="medium" variant="outline" onClick={() => toast.success(t('kit.status.live'))}>Success</Button>
          <Button size="medium" variant="outline" onClick={() => toast.error('Ачаалж чадсангүй', { label: 'Дахин оролдох', onClick: NOOP })}>Error + action</Button>
          <Button size="medium" variant="outline" onClick={() => toast.info(t('nav.saved'), { label: 'Буцаах', onClick: NOOP })}>Info + action</Button>
        </Row>
      </Section>

      <Section title="Banner / NoticeSlot">
        <div className="flex flex-col gap-3">
          <Banner tone="info" title="Мэдэгдэл унтраалттай байна" action={{ label: 'Асаах', onClick: NOOP }} />
          <Banner tone="warning" title="Зарын эрх дуусах дөхлөө" body="5-аас 4 зар ашигласан." action={{ label: 'Багц сунгах', onClick: NOOP }} />
          <Banner tone="offline" title="Сүлжээгүй байна" body="Хадгалсан мэдээллийг харуулж байна" />
          <Banner tone="danger" title="Зар татгалзсан" action={{ label: 'Засах', onClick: NOOP }} />
        </div>
        <Row label="one slot: offline > rejected > quota > notifications off">
          {(Object.keys(notices) as NoticeKind[]).map((k) => (
            <Checkbox key={k} label={k} checked={notices[k]} onChange={(v) => setNotices({ ...notices, [k]: v })} />
          ))}
        </Row>
        <NoticeSlot
          notices={(Object.keys(notices) as NoticeKind[]).filter((k) => notices[k]).map((kind) => ({ kind, used: 4, total: 5, onAction: NOOP }))}
        />
      </Section>

      <Section title="EmptyState / Skeleton / WizardSteps">
        <div className="grid gap-4 sm:grid-cols-3">
          <EmptyState icon="search" title="Илэрц олдсонгүй" body="“Экскаватор”" action={{ label: t('common.clear'), onClick: NOOP }} />
          <EmptyState icon="bookmark" title="Хадгалсан зар алга" action={{ label: t('nav.browse'), onClick: NOOP, variant: 'secondary' }} />
          <EmptyState icon="refresh-cw" title="Ачаалж чадсангүй" body="Сүлжээгээ шалгаад дахин оролдоно уу" action={{ label: 'Дахин оролдох', onClick: NOOP }} />
        </div>
        <EmptyState art={<Icon name="image" size={48} className="text-icon-secondary" />} title="Хадгалсан зар алга" />
        <Row label="skeleton listing row">
          <SkeletonListingRow className="max-w-[360px]" />
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 3, 5].map((n) => <WizardSteps key={n} current={n} />)}
        </div>
      </Section>

      <Section title="TabBar / TabBarItem">
        <Row label="item default / active / with count">
          <div className="flex w-72 rounded-card bg-bg-surface"><TabBarItem icon="search" label="Хайх" /><TabBarItem icon="bookmark" label="Хадгалсан" active /><TabBarItem icon="message-circle" label="Чат" count={3} /></div>
        </Row>
        <Row label="quota meter"><QuotaMeter used={2} total={5} className="w-[34px]" /></Row>
        <Phone><CustomerTabBar preview active="search" unread={3} /></Phone>
        <Phone><ProviderTabBar preview active="listings" quota={{ used: 2, total: 3 }} unread={1} /></Phone>
        <Phone><AdminTabBar preview active="approval" /></Phone>
      </Section>

      <Section title="AppHeader">
        <Phone className="flex flex-col"><AppHeader variant="root" title="Хадгалсан" action={{ icon: 'sliders-horizontal', label: t('filter.title'), onClick: NOOP }} /></Phone>
        <Phone><AppHeader variant="pushed" title="Зар нэмэх" subtitle="2 / 6" onBack={NOOP} action={{ icon: 'more-horizontal', label: t('common.more'), onClick: NOOP }} /></Phone>
        <Phone><AppHeader variant="brand" action={{ icon: 'bell', label: t('notifications.title'), onClick: NOOP }} /></Phone>
        <Phone><AppHeader variant="chat" name="Хүнд Техник ХХК" replyNote="Ихэвчлэн 2 цагт хариулдаг" onBack={NOOP} action={{ icon: 'phone', label: 'Залгах', onClick: NOOP }} /></Phone>
      </Section>

      <Section title="Sidebar / SidebarItem">
        <div className="flex w-72 flex-col gap-1"><SidebarItem icon="home" label="Нүүр" active /><SidebarItem icon="message-circle" label="Чат" count={4} /><SidebarItem icon="user" label="Профайл" /></div>
        <div className="flex flex-wrap items-start gap-4">
          <ProviderSidebar preview active="home" quota={{ used: 2, total: 3 }} unread={2} onAdd={NOOP} />
          <AdminSidebar preview active="listings" />
        </div>
      </Section>

      <Section title="DesktopHeader / DesktopPageHeader / DesktopWizardHeader">
        <div className="overflow-x-auto"><div className="min-w-[900px] overflow-hidden rounded-card ring-1 ring-border-subtle">
          <DesktopHeader preview variant="signedIn" query="" onQuery={NOOP} avatarName="Бат Болд" active="messages" unread />
        </div></div>
        <div className="overflow-x-auto"><div className="min-w-[900px] overflow-hidden rounded-card ring-1 ring-border-subtle">
          <DesktopHeader preview variant="guest" query="" onQuery={NOOP} />
        </div></div>
        <div className="overflow-hidden rounded-card ring-1 ring-border-subtle"><DesktopHeader preview variant="none" /></div>
        <DesktopPageHeader title="Сайн байна уу, Бат-Эрдэнэ" subtitle="Хүнд Техник ХХК · 2026.10.08" onBell={NOOP} avatarName="Хүнд Техник" avatarType="company" />
        <DesktopWizardHeader title="Зар нэмэх" savedNote="Ноорог хадгалагдсан · дөнгөж сая" current={3} />
      </Section>

      <Section title="ListingCard / SkeletonListingRow">
        <div className="grid gap-4 md:grid-cols-2">
          <ListingCard variant="row" title="Komatsu PC200 экскаватор түрээс, оператортой" categoryKey="machineryrent" categoryIcon="truck" location="Хан-Уул" postedAt={AGO} price={450000} priceUnit="DAY" saved={saved} onSave={() => setSaved(!saved)} featured />
          <ListingCard variant="row" title="Тээврийн хөлс" categoryKey="legacy" location="Баянгол" postedAt={AGO} price={120000} priceUnit="TRIP" dates={{ available: true }} total="3 өдөр · 1,350,000₮" />
          <ListingCard variant="row" title="Бетон зуурагч" categoryKey="toolrent" categoryIcon="wrench" location="Сүхбаатар" postedAt={AGO} price={80000} priceUnit="DAY" dates={{ available: false }} />
        </div>
        <div className="flex flex-wrap gap-4">
          <ListingCard variant="grid" title="Komatsu PC200 экскаватор түрээс, оператортой" categoryKey="machineryrent" categoryIcon="truck" categoryLabel="Механизм түрээс" location="Хан-Уул" postedAt={AGO} price={450000} priceUnit="DAY" featured saved={saved} onSave={() => setSaved(!saved)} />
          <ListingCard variant="grid" title="Ажилтан" categoryKey="jobvacancy" categoryIcon="briefcase" categoryLabel="Ажлын байр" location="Дархан" postedAt={AGO} price={2500000} priceUnit="MONTH" dates={{ available: true }} total="3 өдөр · 1,350,000₮" />
        </div>
      </Section>

      <Section title="ListingActionBar">
        <Phone><ListingActionBar preview kind="book" price={450000} priceUnit="DAY" onPrimary={NOOP} onMessage={NOOP} /></Phone>
        <Phone><ListingActionBar preview kind="call" price={450000} priceUnit="DAY" onPrimary={NOOP} onMessage={NOOP} /></Phone>
        <Phone><ListingActionBar preview kind="sos" /></Phone>
      </Section>

      <Section title="MapPin">
        <Row label="price / selected / cluster">
          <MapPin variant="price" price={450000} />
          <span className="px-2"><MapPin variant="selected" price={450000} /></span>
          <MapPin variant="cluster" count={12} />
        </Row>
      </Section>

      <Section title="MessageBubble">
        <div className="flex w-full max-w-[390px] flex-col gap-2">
          <MessageBubble direction="in" text="Сайн байна уу, маргааш боломжтой юу?" at={AGO} />
          <MessageBubble direction="out" text="Боломжтой, 9 цагт очно." at={AGO} status="sending" />
          <MessageBubble direction="out" text="Баярлалаа" at={AGO} status="sent" />
          <MessageBubble direction="out" text="Ойлголоо" at={AGO} status="read" />
        </div>
      </Section>

      <Section title="InboxRow / NotificationRow">
        <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-card ring-1 ring-border-subtle">
          <InboxRow name="Хүнд Техник ХХК" listing="Komatsu PC200 экскаватор" preview="Маргааш боломжтой, 9 цагт очно." at={Date.now()} unread={2} />
          <InboxRow name="Бат Болд" listing="Бетон зуурагч" preview="Баярлалаа" at={Date.now() - 3 * 86400_000} />
        </div>
        <div className="grid gap-px overflow-hidden rounded-card ring-1 ring-border-subtle md:grid-cols-2">
          {NOTIFICATION_TYPES.flatMap(([type, key]) => [
            <NotificationRow key={`${type}-u`} type={type} text={key ? t(key) : '2 зар 3 хоногт дуусна'} at={AGO} unread />,
            <NotificationRow key={`${type}-r`} type={type} text={key ? t(key) : '2 зар 3 хоногт дуусна'} at={AGO} />,
          ])}
        </div>
      </Section>

      <Section title="TaskCard / StatTile / SellerCard / HealthRing">
        <div className="grid gap-3 md:grid-cols-2">
          <TaskCard type="request" title="3 захиалгын хүсэлт" subtitle="Хамгийн эртнийх 2 цагийн өмнө" actionLabel="Харах" />
          <TaskCard type="rejected" title="Зар татгалзсан" subtitle={t('admin.reasonTypes.wrongPrice')} actionLabel="Засах" />
          <TaskCard type="expiring" title="2 зар 3 хоногт дуусна" subtitle="Сунгавал хайлтад үлдэнэ" actionLabel="Сунгах" />
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <StatTile className="w-[170px]" icon="eye" label="Үзэлт" value={1248} delta={{ kind: 'up', text: '+18% өмнөх 7 хоногоос' }} />
          <StatTile className="w-[170px]" icon="bookmark" label="Хадгалсан" value={64} delta={{ kind: 'flat', text: 'Өмнөхтэй адил' }} />
        </div>
        <SellerCard name="Хүнд Техник ХХК" verified verifiedLabel={t('kit.status.verified')} meta="2024.03-оос гишүүн · 38 ажил" rating={{ value: 4.8, count: 21 }} replyNote="Ихэвчлэн 2 цагт хариулдаг" />
        <Row label="health ring 72 / 56 / 40 (value hidden under 48)">
          <ListingHealthRing value={72} />
          <ListingHealthRing value={72} size={56} label="" />
          <ListingHealthRing value={72} size={40} label="" />
        </Row>
      </Section>

      <Section title="MyListingRow">
        <div className="grid gap-3 md:grid-cols-2">
          <MyListingRow status="live" title="Komatsu PC200 экскаватор түрээс, оператортой" categoryKey="machineryrent" categoryIcon="truck" price={450000} priceUnit="DAY" meta="128 үзэлт · 6 хадгалсан · 3 хоног үлдсэн" action={{ label: 'Онцлох' }} />
          <MyListingRow status="rejected" title="Бетон зуурагч" categoryKey="toolrent" categoryIcon="wrench" price={80000} priceUnit="DAY" note={t('admin.reasonTypes.wrongPrice')} />
          <MyListingRow status="expired" title="Тээврийн хөлс" categoryKey="transport" categoryIcon="truck" price={120000} priceUnit="TRIP" action={{ label: 'Сунгах', icon: 'refresh-cw' }} />
        </div>
      </Section>

      <Section title="Modal / BottomSheet / SheetGrabber">
        <Row>
          <Button variant="outline" size="medium" onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="outline" size="medium" onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <SheetGrabber />
        </Row>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          tone="danger"
          title={t('common.confirm')}
          body={t('common.irreversible')}
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={() => setModalOpen(false)}
        />
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('filter.title')}
          secondary={{ label: t('common.clear'), onClick: NOOP }}
          primary={{ label: '24 зар харах', onClick: () => setSheetOpen(false) }}
        >
          <Radio name="sheet" value="a" label="Өдрөөр" checked={radio === 'a'} onChange={setRadio} />
          <Radio name="sheet" value="b" label="Цагаар" checked={radio === 'b'} onChange={setRadio} />
          <Checkbox label="Онцлох" checked={boxes.a} onChange={(a) => setBoxes({ ...boxes, a })} />
        </BottomSheet>
      </Section>

      <Section title="DateRangeCalendar">
        <DateRangeCalendar value={range} onChange={setRange} booked={[dayKey(5), dayKey(6), dayKey(7)]} />
      </Section>

      <Toaster />

      <Section title="Icon set">
        <div className="flex flex-wrap gap-4 text-icon-primary">
          {[...SHIPPED_ICONS].map((n) => (
            <span key={n} title={n} className="inline-flex"><Icon name={n} size={24} /></span>
          ))}
        </div>
      </Section>
    </div>
  );
}
