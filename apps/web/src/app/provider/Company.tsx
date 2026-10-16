import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { normalizeWebsiteUrl, PROVINCE_CODES, validateEmail, validatePhone, type Company as CompanyT, type CompanyWriteRequest } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useDocTitle } from '@/lib/meta';
import { useMyCompany, useSaveCompany } from '@/lib/provider';
import { useToast } from '@/lib/toast';
import { Avatar } from '@/ui/Avatar';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { TextArea } from '@/ui/TextArea';
import { TextField } from '@/ui/TextField';
import { PageHead, ProviderOnly } from './Page';

interface Draft {
  name: string; description: string; phone: string; website: string; email: string; address: string; reg: string; tax: string; area: string[];
}

const fromCompany = (c: CompanyT | null): Draft => ({
  name: c?.name ?? '', description: c?.description ?? '', phone: c?.phone_number ?? '', website: c?.website ?? '', email: c?.email ?? '',
  address: c?.address ?? '', reg: c?.registration_number ?? '', tax: c?.tax_id ?? '', area: c?.service_area ?? [],
});

function Form({ company }: { company: CompanyT | null }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const save = useSaveCompany(company);
  const [d, setD] = useState<Draft>(() => fromCompany(company));
  const [tried, setTried] = useState(false);
  const base = fromCompany(company);
  const upd = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const errs = {
    name: d.name.trim() ? undefined : t('company.nameRequired'),
    phone: d.phone && !validatePhone(d.phone) ? t('common.invalidPhone') : undefined,
    email: d.email && !validateEmail(d.email) ? t('common.invalidEmail') : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);
  const identityChanged = !!company?.is_verified && (d.name.trim() !== base.name || d.reg.trim() !== base.reg || d.tax.trim() !== base.tax);

  const submit = () => {
    setTried(true);
    if (invalid) return;
    const nul = (v: string) => (v.trim() === '' ? null : v.trim());
    const body: CompanyWriteRequest = {
      name: d.name.trim(), description: nul(d.description), phone_number: nul(d.phone), website: nul(normalizeWebsiteUrl(d.website)), email: nul(d.email),
      address: nul(d.address), registration_number: nul(d.reg), tax_id: nul(d.tax), service_area: d.area,
    };
    save.mutate(body, {
      onSuccess: () => {
        toast.success(t(company ? 'prov.company.saved' : 'prov.company.created'));
        void nav('/profile', { replace: true });
      },
      onError: (e) => toast.error(t(errorKey(e))),
    });
  };

  const show = (k: keyof typeof errs) => (tried ? errs[k] : undefined);

  return (
    <div className="pb-28 md:pb-10">
      <PageHead title={company ? t('prov.company.title') : t('prov.company.create')} back />
      <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pt-2 md:mx-0 md:px-8 md:pt-6">
        <div className="flex items-center gap-4">
          <Avatar name={d.name} type="company" size="large" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex items-center gap-1 text-title text-text-primary">
              <span className="truncate">{d.name || t('prov.company.newCompany')}</span>
              {company?.is_verified && <span role="img" aria-label={t('prov.company.verified')} className="inline-flex text-icon-accent"><Icon name="badge-check" size={18} /></span>}
            </p>
            {company?.is_verified && <p className="text-caption text-status-success">{t('prov.company.verified')}</p>}
          </div>
        </div>
        {!company && <Banner tone="info" title={t('prov.company.createNote')} />}
        {identityChanged && <Banner tone="warning" title={t('prov.company.verifyWarning')} />}

        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-title text-text-primary">{t('prov.company.general')}</h2>
          <TextField label={t('prov.company.name')} value={d.name} maxLength={150} error={show('name')} onChange={(e) => upd({ name: e.target.value })} />
          <TextArea label={t('prov.company.about')} rows={4} value={d.description} maxLength={2000} onChange={(e) => upd({ description: e.target.value })} />
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-title text-text-primary">{t('prov.company.serviceArea')}</h2>
          <div className="flex flex-wrap gap-2">
            {PROVINCE_CODES.map((c) => (
              <Chip key={c} label={t(`province.${c}`)} selected={d.area.includes(c)} onClick={() => upd({ area: d.area.includes(c) ? d.area.filter((x) => x !== c) : [...d.area, c] })} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-title text-text-primary">{t('prov.company.contact')}</h2>
          <TextField label={t('prov.company.phone')} type="tel" inputMode="tel" value={d.phone} error={show('phone')} onChange={(e) => upd({ phone: e.target.value })} />
          <TextField label={t('prov.company.website')} value={d.website} autoCapitalize="none" onChange={(e) => upd({ website: e.target.value })} />
          <TextField label={t('prov.company.email')} type="email" value={d.email} error={show('email')} onChange={(e) => upd({ email: e.target.value })} />
          <TextField label={t('prov.company.address')} value={d.address} onChange={(e) => upd({ address: e.target.value })} />
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-title text-text-primary">{t('prov.company.legal')} <span className="text-caption text-text-secondary">· {t('prov.company.optional')}</span></h2>
          <TextField label={t('prov.company.regNo')} value={d.reg} onChange={(e) => upd({ reg: e.target.value })} />
          <TextField label={t('prov.company.taxId')} value={d.tax} onChange={(e) => upd({ tax: e.target.value })} />
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:static md:mx-8 md:mt-4 md:max-w-[640px] md:border-0 md:bg-transparent md:p-0">
        <Button loading={save.isPending} onClick={submit} className="w-full md:w-auto">{t('prov.company.save')}</Button>
      </div>
    </div>
  );
}

function Loader() {
  const { t } = useTranslation();
  const q = useMyCompany();
  useDocTitle(t('prov.company.title'));
  if (q.isError) return <EmptyState icon="refresh-cw" title={t('customer.browse.loadFailed')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} className="py-24" />;
  if (!q.data) return <p role="status" className="p-8 text-center text-caption text-text-secondary">{t('ui.loading')}</p>;
  return <Form company={q.data.company} />;
}

export default function Company() {
  return <ProviderOnly><Loader /></ProviderOnly>;
}
