const VARIANTS = {
  danger:  'bg-danger/10 border-danger/20 text-danger',
  warning: 'bg-warning/10 border-warning/20 text-warning',
  success: 'bg-success/10 border-success/20 text-success',
  info:    'bg-primary/10 border-primary/20 text-primary',
}

export default function AlertBanner({ variant = 'danger', className = '', children }) {
  return (
    <div className={`p-3.5 min-h-[44px] flex items-center border rounded-lg text-sm ${VARIANTS[variant]} ${className}`}>
      {children}
    </div>
  )
}
