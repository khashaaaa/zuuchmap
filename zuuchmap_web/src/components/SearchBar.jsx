import { Search } from 'lucide-react'
import Input from './Input'

export default function SearchBar({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <Input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pl-8 pr-3"
      />
    </div>
  )
}
