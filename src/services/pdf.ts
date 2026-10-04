import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CreditPayment, PurchaseOrder, Sale, SaleReturn } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { CONDITION_LABELS, saleNoteProductName } from '@/utils/product'
import { useCurrency } from '@/composables/useCurrency'
import { useStoreInfo } from '@/composables/useStoreInfo'
import { imeiDisplayLines } from '@/utils/imei'
import { APPLE_ACCOUNT_NOTICE } from '@/utils/appleAccount'
import { PURCHASE_ORDER_STATUS_LABELS } from '@/utils/purchaseOrder'

function withImeis(name: string, imeis: unknown): string {
  const lines = imeiDisplayLines(imeis)
  if (!lines.length) return name
  return [name, ...lines].join('\n')
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  canje: 'Equipo a cuenta',
  credito: 'Crédito',
  otro: 'Otro',
}

const RECEIPT_WIDTH = 80
/** Alto de la hoja de prueba donde se mide el ticket antes de crearlo. */
const RECEIPT_PROBE_HEIGHT = 5000
const RECEIPT_MIN_HEIGHT = 100

/** Dibuja el ticket en la página actual y devuelve la última coordenada Y usada. */
function drawSaleReceipt(doc: jsPDF, sale: Sale): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const store = useStoreInfo()
  let y = 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(store.displayName(), pageWidth / 2, y, { align: 'center' })
  y += 5

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (store.address.value) {
    doc.text(store.address.value, pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - 10 })
    y += 4
  }
  if (store.phone.value) {
    doc.text(`Tel: ${store.phone.value}`, pageWidth / 2, y, { align: 'center' })
    y += 4
  }
  y += 4

  doc.setFontSize(7)
  doc.text(`Ticket #${sale.id.slice(0, 8).toUpperCase()}`, 5, y)
  y += 4
  doc.text(formatDateTime(sale.date), 5, y)
  y += 6

  if (sale.customerName) {
    doc.text(`Cliente: ${sale.customerName}`, 5, y)
    y += 4
  }
  if (sale.customerPhone) {
    doc.text(`Tel: ${sale.customerPhone}`, 5, y)
    y += 4
  }

  y += 2
  doc.setLineWidth(0.2)
  doc.line(5, y, pageWidth - 5, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant', 'Precio', 'Sub']],
    body: sale.items.map((item) => [
      withImeis(saleNoteProductName(item.productName), item.imeis),
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.subtotal),
    ]),
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
    },
    margin: { left: 5, right: 5 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  if (sale.discountAmount && sale.discountAmount > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Subtotal:', 5, y)
    doc.text(
      formatCurrency(sale.subtotal ?? sale.total + sale.discountAmount),
      pageWidth - 5,
      y,
      { align: 'right' },
    )
    y += 5
    const discountLabel =
      sale.discountType === 'percent' ? `Descuento (${sale.discountValue}%):` : 'Descuento:'
    doc.text(discountLabel, 5, y)
    doc.text(`-${formatCurrency(sale.discountAmount)}`, pageWidth - 5, y, { align: 'right' })
    y += 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL:', 5, y)
  doc.text(formatCurrency(sale.total), pageWidth - 5, y, { align: 'right' })
  y += 5

  const { showUsd, formatUsdEquivalent } = useCurrency()
  if (showUsd.value) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`≈ ${formatUsdEquivalent(sale.total, sale.exchangeRate)}`, pageWidth - 5, y, {
      align: 'right',
    })
    y += 5
  }
  y += 1

  if (sale.tradeInValue && sale.tradeInValue > 0) {
    const credit = Math.min(sale.tradeInValue, sale.total)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Equipo a cuenta:', 5, y)
    y += 4
    if (sale.tradeInItems && sale.tradeInItems.length) {
      for (const t of sale.tradeInItems) {
        const label = `  ${saleNoteProductName(t.productName)} x${t.quantity}`
        const lines = doc.splitTextToSize(label, pageWidth - 28) as string[]
        doc.text(lines[0] ?? '', 5, y)
        doc.text(`-${formatCurrency(t.unitValue * t.quantity)}`, pageWidth - 5, y, {
          align: 'right',
        })
        y += 4
        for (const extra of lines.slice(1)) {
          doc.text(extra, 5, y)
          y += 4
        }
        const imeiLines = imeiDisplayLines(t.imeis)
        if (imeiLines.length) {
          doc.setFontSize(7)
          for (const line of imeiLines) {
            doc.text(`  ${line}`, 5, y)
            y += 3.5
          }
          doc.setFontSize(8)
        }
      }
    } else {
      doc.text('  Equipo recibido', 5, y)
      doc.text(`-${formatCurrency(credit)}`, pageWidth - 5, y, { align: 'right' })
      y += 4
    }
    y += 1
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Saldo a pagar:', 5, y)
    doc.text(formatCurrency(Math.max(sale.total - sale.tradeInValue, 0)), pageWidth - 5, y, {
      align: 'right',
    })
    y += 6
  }

  if (sale.paymentMethod === 'credito' && sale.creditBalance !== undefined) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Abono inicial:', 5, y)
    doc.text(formatCurrency(sale.creditDownPayment ?? 0), pageWidth - 5, y, { align: 'right' })
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Saldo pendiente:', 5, y)
    doc.text(formatCurrency(sale.creditBalance), pageWidth - 5, y, { align: 'right' })
    y += 5
    if (sale.creditDueDate) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`Pago final: ${formatDate(sale.creditDueDate)}`, 5, y)
      y += 5
    }
    y += 1
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Pago: ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`, 5, y)
  y += 8

  if (sale.appleAccount) {
    doc.setFont('helvetica', 'bold')
    doc.text('Cuenta Apple', 5, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    for (const line of doc.splitTextToSize(`Apple ID: ${sale.appleAccount.appleId}`, pageWidth - 10) as string[]) {
      doc.text(line, 5, y)
      y += 4
    }
    if (sale.appleAccount.password) {
      for (const line of doc.splitTextToSize(`Contraseña: ${sale.appleAccount.password}`, pageWidth - 10) as string[]) {
        doc.text(line, 5, y)
        y += 4
      }
    }
    doc.setFontSize(7)
    const notice = doc.splitTextToSize(APPLE_ACCOUNT_NOTICE, pageWidth - 10) as string[]
    doc.text(notice, 5, y)
    y += notice.length * 3 + 4
    doc.setFontSize(8)
  }

  if (sale.notes) {
    doc.setFontSize(7)
    const noteLines = doc.splitTextToSize(`Notas: ${sale.notes}`, pageWidth - 10) as string[]
    doc.text(noteLines, 5, y)
    y += noteLines.length * 3 + 5
  }

  doc.setFontSize(7)
  doc.text('¡Gracias por su compra!', pageWidth / 2, y, { align: 'center' })

  return y
}

/**
 * Alto del ticket ajustado al contenido: sirve para el rollo térmico de 80 mm
 * (sin papel en blanco ni cortes) y para una hoja común (un ticket por hoja).
 */
function saleReceiptHeight(sale: Sale): number {
  const probe = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, RECEIPT_PROBE_HEIGHT] })
  const lastY = drawSaleReceipt(probe, sale)
  return Math.max(Math.ceil(lastY + 8), RECEIPT_MIN_HEIGHT)
}

export function generateSaleReceipt(sale: Sale): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, saleReceiptHeight(sale)] })
  drawSaleReceipt(doc, sale)
  return doc
}

/** Un solo PDF con un ticket por página, en el orden recibido. */
export function generateSaleReceipts(sales: Sale[]): jsPDF {
  const [first, ...rest] = sales
  if (!first) throw new Error('No hay ventas para generar tickets')
  const doc = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, saleReceiptHeight(first)] })
  drawSaleReceipt(doc, first)
  for (const sale of rest) {
    doc.addPage([RECEIPT_WIDTH, saleReceiptHeight(sale)], 'portrait')
    drawSaleReceipt(doc, sale)
  }
  return doc
}

function saleReceiptFileName(sale: Sale): string {
  return `ticket-${sale.id.slice(0, 8)}.pdf`
}

export function downloadSaleReceipt(sale: Sale): void {
  const doc = generateSaleReceipt(sale)
  doc.save(saleReceiptFileName(sale))
}

/** Pausa entre descargas para que Chrome no descarte archivos seguidos. */
const MULTI_DOWNLOAD_DELAY_MS = 300

/** Descarga un PDF por venta. */
export async function downloadSaleReceipts(sales: Sale[]): Promise<void> {
  for (const [index, sale] of sales.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, MULTI_DOWNLOAD_DELAY_MS))
    downloadSaleReceipt(sale)
  }
}

let printFrame: HTMLIFrameElement | null = null
let printUrl: string | null = null

/**
 * Abre el diálogo de impresión del documento sin abrir otra pestaña.
 * El PDF va en un iframe oculto; la acción de impresión automática del PDF
 * dispara el diálogo cuando el visor de Chrome termina de cargarlo.
 */
function printPdf(doc: jsPDF): void {
  doc.autoPrint()
  const url = URL.createObjectURL(doc.output('blob'))

  // El iframe anterior se elimina recién ahora: borrarlo antes cerraría su diálogo.
  printFrame?.remove()
  if (printUrl) URL.revokeObjectURL(printUrl)

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '1px'
  frame.style.height = '1px'
  frame.style.border = '0'
  frame.style.opacity = '0'
  frame.src = url
  document.body.appendChild(frame)

  printFrame = frame
  printUrl = url
}

/** Un solo diálogo de impresión con todos los tickets seguidos. */
export function printSaleReceipts(sales: Sale[]): void {
  printPdf(generateSaleReceipts(sales))
}

export function printSaleReceipt(sale: Sale): void {
  printPdf(generateSaleReceipt(sale))
}

const REFUND_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

/** Dibuja la nota de devolución y devuelve la última coordenada Y usada. */
function drawReturnReceipt(doc: jsPDF, sale: Sale, ret: SaleReturn): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const store = useStoreInfo()
  let y = 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(store.displayName(), pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (store.address.value) {
    doc.text(store.address.value, pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - 10 })
    y += 4
  }
  if (store.phone.value) {
    doc.text(`Tel: ${store.phone.value}`, pageWidth / 2, y, { align: 'center' })
    y += 4
  }
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('NOTA DE DEVOLUCIÓN', pageWidth / 2, y, { align: 'center' })
  y += 7

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`Ticket venta #${sale.id.slice(0, 8).toUpperCase()}`, 5, y)
  y += 4
  doc.text(formatDateTime(ret.date), 5, y)
  y += 4
  if (sale.customerName) {
    doc.text(`Cliente: ${sale.customerName}`, 5, y)
    y += 4
  }

  y += 2
  doc.setLineWidth(0.2)
  doc.line(5, y, pageWidth - 5, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant', 'Sub']],
    body: ret.items.map((it) => [
      saleNoteProductName(it.productName) + (it.restocked ? '' : ' (sin reingresar)'),
      String(it.quantity),
      formatCurrency(it.refundPerUnit * it.quantity),
    ]),
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'right' },
    },
    margin: { left: 5, right: 5 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('REEMBOLSO:', 5, y)
  doc.text(formatCurrency(ret.refundAmount), pageWidth - 5, y, { align: 'right' })
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  if (ret.balanceApplied > 0) {
    doc.text('Aplicado al saldo:', 5, y)
    doc.text(formatCurrency(ret.balanceApplied), pageWidth - 5, y, { align: 'right' })
    y += 4
    doc.text('Devuelto en efectivo:', 5, y)
    doc.text(formatCurrency(ret.refundAmount - ret.balanceApplied), pageWidth - 5, y, {
      align: 'right',
    })
    y += 5
  }
  doc.text(`Método: ${REFUND_LABELS[ret.refundMethod] ?? ret.refundMethod}`, 5, y)
  y += 4
  const reasonLines = doc.splitTextToSize(`Motivo: ${ret.reason}`, pageWidth - 10) as string[]
  doc.text(reasonLines, 5, y)
  y += (reasonLines.length - 1) * 3.5 + 6

  if (ret.notes) {
    doc.setFontSize(7)
    const noteLines = doc.splitTextToSize(`Notas: ${ret.notes}`, pageWidth - 10) as string[]
    doc.text(noteLines, 5, y)
    y += (noteLines.length - 1) * 3
  }

  return y
}

/** Alto de la nota de devolución ajustado al contenido, igual que el ticket de venta. */
export function generateReturnReceipt(sale: Sale, ret: SaleReturn): jsPDF {
  const probe = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, RECEIPT_PROBE_HEIGHT] })
  const height = Math.max(Math.ceil(drawReturnReceipt(probe, sale, ret) + 8), RECEIPT_MIN_HEIGHT)
  const doc = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, height] })
  drawReturnReceipt(doc, sale, ret)
  return doc
}

export function downloadReturnReceipt(sale: Sale, ret: SaleReturn): void {
  const doc = generateReturnReceipt(sale, ret)
  doc.save(`devolucion-${sale.id.slice(0, 8)}-${ret.id.slice(0, 6)}.pdf`)
}

export function printReturnReceipt(sale: Sale, ret: SaleReturn): void {
  printPdf(generateReturnReceipt(sale, ret))
}

function purchaseItemName(item: PurchaseOrder['items'][number]): string {
  return [item.brand, item.model, item.variant].filter(Boolean).join(' ')
}

/** Número legible del abono: ticket de la venta y su orden entre los abonos. */
export function creditPaymentCode(sale: Sale, index: number): string {
  return `${sale.id.slice(0, 8).toUpperCase()}-${index + 1}`
}

/** Dibuja el comprobante de abono y devuelve la última coordenada Y usada. */
function drawCreditPaymentReceipt(doc: jsPDF, sale: Sale, index: number): number {
  const payment = sale.creditPayments?.[index] as CreditPayment
  const pageWidth = doc.internal.pageSize.getWidth()
  const store = useStoreInfo()
  const { showUsd, formatUsdEquivalent } = useCurrency()
  let y = 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(store.displayName(), pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (store.address.value) {
    doc.text(store.address.value, pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - 10 })
    y += 4
  }
  if (store.phone.value) {
    doc.text(`Tel: ${store.phone.value}`, pageWidth / 2, y, { align: 'center' })
    y += 4
  }
  y += 2
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('COMPROBANTE DE ABONO', pageWidth / 2, y, { align: 'center' })
  y += 7

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`Comprobante #${creditPaymentCode(sale, index)}`, 5, y)
  y += 4
  doc.text(formatDateTime(payment.date), 5, y)
  y += 4
  doc.text(`Venta #${sale.id.slice(0, 8).toUpperCase()} del ${formatDate(sale.date)}`, 5, y)
  y += 4
  if (sale.customerName) {
    doc.text(`Cliente: ${sale.customerName}`, 5, y)
    y += 4
  }
  if (sale.customerPhone) {
    doc.text(`Tel: ${sale.customerPhone}`, 5, y)
    y += 4
  }

  y += 2
  doc.setLineWidth(0.2)
  doc.line(5, y, pageWidth - 5, y)
  y += 5

  const row = (label: string, value: string) => {
    doc.text(label, 5, y)
    doc.text(value, pageWidth - 5, y, { align: 'right' })
  }

  doc.setFontSize(8)
  row('Total de la venta:', formatCurrency(sale.total))
  y += 5
  if (payment.balanceAfter !== undefined) {
    row('Saldo anterior:', formatCurrency(payment.balanceAfter + payment.amount))
    y += 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  row('ABONO:', formatCurrency(payment.amount))
  y += 5
  if (showUsd.value) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`≈ ${formatUsdEquivalent(payment.amount, sale.exchangeRate)}`, pageWidth - 5, y, {
      align: 'right',
    })
    y += 5
  }
  y += 1

  if (payment.balanceAfter !== undefined) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    if (payment.balanceAfter > 0) {
      row('Saldo pendiente:', formatCurrency(payment.balanceAfter))
      y += 5
      if (payment.nextDueDate) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(`Próximo pago: ${formatDate(payment.nextDueDate)}`, 5, y)
        y += 5
      }
    } else {
      doc.text('SALDO CANCELADO', pageWidth / 2, y, { align: 'center' })
      y += 5
    }
    y += 3
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('¡Gracias por su pago!', pageWidth / 2, y, { align: 'center' })

  return y
}

export function generateCreditPaymentReceipt(sale: Sale, index: number): jsPDF {
  if (!sale.creditPayments?.[index]) throw new Error('Abono no encontrado')
  const probe = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, RECEIPT_PROBE_HEIGHT] })
  const height = Math.max(
    Math.ceil(drawCreditPaymentReceipt(probe, sale, index) + 8),
    RECEIPT_MIN_HEIGHT,
  )
  const doc = new jsPDF({ unit: 'mm', format: [RECEIPT_WIDTH, height] })
  drawCreditPaymentReceipt(doc, sale, index)
  return doc
}

export function downloadCreditPaymentReceipt(sale: Sale, index: number): void {
  generateCreditPaymentReceipt(sale, index).save(`abono-${creditPaymentCode(sale, index)}.pdf`)
}

export function printCreditPaymentReceipt(sale: Sale, index: number): void {
  printPdf(generateCreditPaymentReceipt(sale, index))
}

export function generatePurchaseOrder(order: PurchaseOrder): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const store = useStoreInfo()
  const marginX = 15
  let y = 18

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(store.displayName(), marginX, y)

  doc.setFontSize(16)
  doc.text('ORDEN DE COMPRA', pageWidth - marginX, y, { align: 'right' })

  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (store.phone.value) doc.text(`Tel: ${store.phone.value}`, marginX, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(order.code, pageWidth - marginX, y, { align: 'right' })

  if (store.address.value) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(store.address.value, marginX, y, { maxWidth: pageWidth - marginX * 2 - 40 })
  }

  y += 8
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Proveedor', marginX, y)
  doc.text('Fecha', pageWidth - marginX - 45, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(order.supplierName || '—', marginX, y)
  doc.text(formatDate(order.date), pageWidth - marginX - 45, y)
  y += 5
  if (order.expectedDate) {
    doc.setFont('helvetica', 'bold')
    doc.text('Entrega estimada', pageWidth - marginX - 45, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(order.expectedDate), pageWidth - marginX, y, { align: 'right' })
    y += 5
  }
  if (order.status !== 'pending') {
    doc.setFont('helvetica', 'bold')
    doc.text('Estado', pageWidth - marginX - 45, y)
    doc.setFont('helvetica', 'normal')
    doc.text(PURCHASE_ORDER_STATUS_LABELS[order.status], pageWidth - marginX, y, { align: 'right' })
    y += 5
  }

  // La columna Recibido aparece recién cuando hubo una recepción.
  const showReceived = order.items.some((item) => item.receivedQuantity > 0)

  y += 4
  autoTable(doc, {
    startY: y,
    head: [
      showReceived
        ? ['Modelo', 'Condición', 'Cant.', 'Recibido', 'Costo unit.', 'Subtotal']
        : ['Modelo', 'Condición', 'Cant.', 'Costo unit.', 'Subtotal'],
    ],
    body: order.items.map((item) => [
      purchaseItemName(item),
      CONDITION_LABELS[item.condition],
      String(item.quantity),
      ...(showReceived ? [String(item.receivedQuantity)] : []),
      formatCurrency(item.unitCost),
      formatCurrency(item.unitCost * item.quantity),
    ]),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [37, 37, 37], textColor: [255, 255, 255] },
    columnStyles: showReceived
      ? {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 26 },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 26, halign: 'right' },
          5: { cellWidth: 26, halign: 'right' },
        }
      : {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 28 },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
        },
    margin: { left: marginX, right: marginX },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('TOTAL:', pageWidth - marginX - 40, y)
  doc.text(formatCurrency(order.total), pageWidth - marginX, y, { align: 'right' })
  y += 10

  if (order.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Notas:', marginX, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(order.notes, marginX, y, { maxWidth: pageWidth - marginX * 2 })
  }

  return doc
}

export function downloadPurchaseOrder(order: PurchaseOrder): void {
  const doc = generatePurchaseOrder(order)
  doc.save(`${order.code}.pdf`)
}

export function printPurchaseOrder(order: PurchaseOrder): void {
  printPdf(generatePurchaseOrder(order))
}
