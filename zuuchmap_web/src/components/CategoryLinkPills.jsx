import { Link } from 'react-router-dom'
import { pillBase, pillInactive, pillShape } from './CategoryFilterPills'

/**
 * Category *navigation* pills — links into a browse page, no selected state.
 * Same visual vocabulary as CategoryFilterPills so a dashboard row and a
 * browse filter read as one control.
 */
export default function CategoryLinkPills({ categories, allLabel, shape = 'lg', basePath = '/browse', className = '' }) {
  const cls = `${pillBase} ${pillShape(shape)} ${pillInactive}`
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {allLabel !== undefined && <Link to={basePath} className={cls}>{allLabel}</Link>}
      {categories.map((cat) => (
        <Link key={cat.key} to={`${basePath}?category=${cat.key}`} className={cls}>
          {cat.label}
        </Link>
      ))}
    </div>
  )
}
