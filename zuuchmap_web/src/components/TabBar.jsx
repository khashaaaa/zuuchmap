export default function TabBar({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 bg-surface2 rounded-lg p-1 w-fit max-w-full overflow-x-auto ${className}`}>
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            value === tab.key ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
