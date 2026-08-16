import { motion } from 'framer-motion'

export default function StatCard({ icon: Icon, label, value, color = 'text-primary', className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-surface border border-border/20 shadow-card rounded-card p-4 ${className}`}
    >
      {Icon ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-surface2 flex items-center justify-center shrink-0">
            <Icon size={18} className={color} />
          </div>
          <div>
            <p className="text-xs md:text-sm text-muted">{label}</p>
            <p className="text-2xl md:text-3xl font-bold text-text mt-0.5">{value?.toLocaleString() ?? '—'}</p>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-xs text-muted mb-0.5">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value?.toLocaleString() ?? '—'}</p>
        </div>
      )}
    </motion.div>
  )
}
