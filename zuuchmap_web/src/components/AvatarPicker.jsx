import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getProfileImageUrl } from '@/lib/utils'

export default function AvatarPicker({ previewUrl, profilePicture, name, onChange }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const displayUrl = previewUrl ?? (profilePicture ? getProfileImageUrl(profilePicture) : null)
  const initial = name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex flex-col items-center gap-2 mb-2">
      <div className="w-20 h-20 rounded-full overflow-hidden bg-surface2 border-2 border-border/50">
        {displayUrl ? (
          <img src={displayUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary">
            {initial}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Camera size={13} /> {t('profile.changePicture')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange?.(e.target.files[0])}
      />
    </div>
  )
}
