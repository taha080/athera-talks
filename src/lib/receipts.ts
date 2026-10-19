export type ReceiptTick = 'sent' | 'delivered' | 'seen'

export function receiptTick(
  message: { readAt?: string | null; deliveredAt?: string | null },
  receiptsShared: boolean,
): ReceiptTick {
  if (!receiptsShared) return 'sent'
  if (message.readAt) return 'seen'
  if (message.deliveredAt) return 'delivered'
  return 'sent'
}
