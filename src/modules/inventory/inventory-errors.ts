import { HttpException, HttpStatus } from '@nestjs/common';

export function inventoryError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ message, error: code }, status);
}

export const InventoryErrors = {
  itemNotFound: () =>
    inventoryError('INVENTORY_ITEM_NOT_FOUND', 'Inventory item not found', HttpStatus.NOT_FOUND),
  supplierNotFound: () =>
    inventoryError('SUPPLIER_NOT_FOUND', 'Supplier not found', HttpStatus.NOT_FOUND),
  poNotFound: () =>
    inventoryError('PURCHASE_ORDER_NOT_FOUND', 'Purchase order not found', HttpStatus.NOT_FOUND),

  duplicateSku: () =>
    inventoryError('DUPLICATE_SKU', 'An item with that SKU already exists', HttpStatus.CONFLICT),
  duplicateSupplierName: () =>
    inventoryError(
      'DUPLICATE_SUPPLIER_NAME',
      'A supplier with that name already exists',
      HttpStatus.CONFLICT,
    ),

  /** A movement or receive would drive on-hand below zero. */
  negativeStock: (name: string) =>
    inventoryError(
      'NEGATIVE_STOCK',
      `That movement would drive ${name} below zero on hand`,
      HttpStatus.CONFLICT,
    ),

  zeroAdjustment: () =>
    inventoryError('ZERO_ADJUSTMENT', 'An adjustment must be non-zero', HttpStatus.BAD_REQUEST),

  invalidPoTransition: (from: string, to: string) =>
    inventoryError(
      'INVALID_PO_TRANSITION',
      `A purchase order cannot move from ${from} to ${to}`,
      HttpStatus.CONFLICT,
    ),

  poNotReceivable: () =>
    inventoryError(
      'PO_NOT_RECEIVABLE',
      'Only a SENT purchase order can be received',
      HttpStatus.CONFLICT,
    ),

  emptyPo: () =>
    inventoryError('EMPTY_PO', 'A purchase order needs at least one line', HttpStatus.BAD_REQUEST),

  poNotEditable: () =>
    inventoryError(
      'PO_NOT_EDITABLE',
      'A received or cancelled purchase order can no longer be edited',
      HttpStatus.CONFLICT,
    ),
};
