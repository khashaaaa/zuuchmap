import { useTranslation } from 'react-i18next';
import { DISTRICT_CODES, PROVINCE_CODES } from '@zuuchmap/core';
import { BottomSheet } from '@/ui/BottomSheet';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  province?: string;
  district?: string;
  /** SOS only needs the province. */
  provinceOnly?: boolean;
  onPick: (province?: string, district?: string) => void;
}

export function PlaceSheet({ open, onClose, province, district, provinceOnly, onPick }: Props) {
  const { t } = useTranslation();
  const rows: { code?: string; label: string }[] = [{ label: t('customer.landing.allProvinces') }, ...PROVINCE_CODES.map((c) => ({ code: c, label: t(`province.${c}`) }))];
  return (
    <BottomSheet open={open} onClose={onClose} title={t('common.province')}>
      {!provinceOnly && province === 'ULAANBAATAR' && (
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-secondary">{t('kit.pickDistrict')}</p>
          <div className="flex flex-wrap gap-2">
            <Chip label={t('filter.all')} selected={!district} onClick={() => onPick(province, undefined)} />
            {DISTRICT_CODES.map((d) => (
              <Chip key={d} label={t(`district.${d}`)} selected={district === d} onClick={() => { onPick(province, d); onClose(); }} />
            ))}
          </div>
        </div>
      )}
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.code ?? 'all'}>
            <button
              type="button"
              aria-pressed={(province ?? '') === (r.code ?? '')}
              onClick={() => {
                onPick(r.code, undefined);
                if (provinceOnly || r.code !== 'ULAANBAATAR') onClose();
              }}
              className="flex min-h-12 w-full items-center justify-between rounded-md px-2 text-left text-body text-text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              {r.label}
              {(province ?? '') === (r.code ?? '') && <Icon name="check" size={18} />}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
