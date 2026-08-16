import { User } from 'lucide-react'
import { getProfileImageUrl } from '@/lib/utils'

const SIZE_CLASSES = {
  sm:  'w-8 h-8 text-xs',
  md:  'w-10 h-10 text-sm',
  lg:  'w-16 h-16 text-2xl',
  xl:  'w-20 h-20 text-3xl',
}

const ICON_SIZES = { sm: 15, md: 16, lg: 24, xl: 28 }

export default function UserAvatar({ src, name, size = 'sm', className = '' }) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.sm
  const initial = name?.[0]?.toUpperCase() ?? null
  const imgUrl = getProfileImageUrl(src)

  return (
    <div className={`rounded-full bg-primary/15 flex items-center justify-center overflow-hidden shrink-0 ${sizeClass} ${className}`}>
      {imgUrl ? (
        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
      ) : initial ? (
        <span className="font-bold text-primary">{initial}</span>
      ) : (
        <User size={ICON_SIZES[size] ?? 15} className="text-primary" />
      )}
    </div>
  )
}
