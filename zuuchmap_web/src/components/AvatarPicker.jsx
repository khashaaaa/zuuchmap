import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import UserAvatar from './UserAvatar'

export default function AvatarPicker({ previewUrl, profilePicture, name, onChange }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)

  return (
    <div className="flex flex-col items-center gap-2 mb-2">
      <div className="w-20 h-20 rounded-full overflow-hidden bg-surface2 border-2 border-border/50">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <UserAvatar src={profilePicture} name={name} size="xl" />
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-primary-text hover:underline transition-colors"
      >
        <Camera size={13} /> {t('profile.changePicture')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onChange?.(e.target.files[0])
          // Reset the value, or picking the SAME file again is not a change and
          // fires no event at all — the picker silently does nothing the second
          // time. Must run after onChange, which already holds the File object.
          e.target.value = ''
        }}
      />
    </div>
  )
}
