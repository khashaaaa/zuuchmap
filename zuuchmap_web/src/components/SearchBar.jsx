import { Search } from 'lucide-react'
import Input from './Input'

export default function SearchBar({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      {/* A search box is not prose: mobile browsers otherwise capitalise the
          first letter and autocorrect Mongolian trade terms mid-query. Set
          here rather than on Input, which also backs name/address fields. */}
      <Input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className="pl-8 pr-3"
      />
    </div>
  )
}
