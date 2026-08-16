export default function InfoSection({ title, children, className = '' }) {
  return (
    <div className={`pt-4 border-t border-border/50 ${className}`}>
      {title && <p className="text-sm text-muted font-medium mb-2">{title}</p>}
      {children}
    </div>
  )
}
