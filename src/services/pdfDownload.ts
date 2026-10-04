import type { PurchaseOrder, Sale, SaleReturn } from '@/types'
import { useAppStore } from '@/stores/app'

/**
 * Carga jsPDF recién al pedir un documento. Así las vistas abren sin parsear
 * ~440 KB de PDF, lo que se nota en equipos antiguos. El service worker deja
 * el módulo en caché, por lo que también funciona sin conexión.
 */
async function withPdf(run: (pdf: typeof import('./pdf')) => void | Promise<void>): Promise<void> {
  try {
    await run(await import('./pdf'))
  } catch (e) {
    console.error(e)
    useAppStore().showToast('No se pudo generar el PDF', 'error')
  }
}

export function downloadSaleReceipt(sale: Sale): Promise<void> {
  return withPdf((pdf) => pdf.downloadSaleReceipt(sale))
}

export function downloadSaleReceipts(sales: Sale[]): Promise<void> {
  return withPdf((pdf) => pdf.downloadSaleReceipts(sales))
}

export function printSaleReceipts(sales: Sale[]): Promise<void> {
  return withPdf((pdf) => pdf.printSaleReceipts(sales))
}

export function printSaleReceipt(sale: Sale): Promise<void> {
  return withPdf((pdf) => pdf.printSaleReceipt(sale))
}

export function printReturnReceipt(sale: Sale, saleReturn: SaleReturn): Promise<void> {
  return withPdf((pdf) => pdf.printReturnReceipt(sale, saleReturn))
}

export function downloadCreditPaymentReceipt(sale: Sale, index: number): Promise<void> {
  return withPdf((pdf) => pdf.downloadCreditPaymentReceipt(sale, index))
}

export function printCreditPaymentReceipt(sale: Sale, index: number): Promise<void> {
  return withPdf((pdf) => pdf.printCreditPaymentReceipt(sale, index))
}

export function downloadReturnReceipt(sale: Sale, saleReturn: SaleReturn): Promise<void> {
  return withPdf((pdf) => pdf.downloadReturnReceipt(sale, saleReturn))
}

export function downloadPurchaseOrder(order: PurchaseOrder): Promise<void> {
  return withPdf((pdf) => pdf.downloadPurchaseOrder(order))
}

export function printPurchaseOrder(order: PurchaseOrder): Promise<void> {
  return withPdf((pdf) => pdf.printPurchaseOrder(order))
}
