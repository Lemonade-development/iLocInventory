import type { PurchaseOrderItem, PurchaseOrderStatus } from '@/types'

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  received: 'Recibido',
  cancelled: 'Cancelado',
}

export const PURCHASE_ORDER_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  pending: 'bg-warning/20 text-warning',
  partial: 'bg-sky-500/20 text-sky-400',
  received: 'bg-success/20 text-success',
  cancelled: 'bg-zinc-700 text-zinc-400',
}

export function purchaseOrderItemName(item: PurchaseOrderItem): string {
  return [item.brand, item.model, item.variant].filter(Boolean).join(' ')
}
