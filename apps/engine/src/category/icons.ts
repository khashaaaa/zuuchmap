/**
 * Lucide names the clients ship (mirrors apps/web/src/ui/Icon.tsx). An admin may only set one
 * of these; anything else falls back to the family icon on read.
 */
export const SHIPPED_ICON_NAMES: ReadonlySet<string> = new Set([
  'plus', 'heart', 'x', 'clock', 'circle-alert', 'check', 'calendar', 'badge-check', 'pencil', 'circle-check',
  'building-2', 'phone', 'search', 'map-pin', 'chevron-down', 'chevron-left', 'chevron-right', 'list', 'map',
  'minus', 'star', 'share-2', 'flag', 'bell', 'camera', 'send', 'locate', 'sliders-horizontal', 'message-circle',
  'bookmark', 'user', 'home', 'package', 'truck', 'wrench', 'briefcase', 'image', 'eye', 'trash-2',
  'more-horizontal', 'arrow-left', 'info', 'alert-triangle', 'wifi-off', 'wifi', 'settings', 'log-out',
  'shield-check', 'trending-up', 'layout-grid', 'file-text', 'users', 'bar-chart-3', 'megaphone', 'filter',
  'refresh-cw', 'copy', 'external-link', 'check-check', 'circle', 'loader-2', 'calendar-range', 'message-square',
]);
