import {
  stockDelta,
  stockStaysNonNegative,
  canTransitionPo,
  assertPoTransition,
  poIsEditable,
  computePoTotals,
  formatPoNumber,
} from './inventory-rules';

describe('stock movement → delta', () => {
  it('adds for IN, subtracts for OUT and WASTAGE', () => {
    expect(stockDelta('IN', 10)).toBe(10);
    expect(stockDelta('OUT', 4)).toBe(-4);
    expect(stockDelta('WASTAGE', 3)).toBe(-3);
  });

  it('forces the sign so a negative magnitude cannot flip the direction', () => {
    expect(stockDelta('IN', -10)).toBe(10);
    expect(stockDelta('OUT', -4)).toBe(-4);
  });

  it('passes ADJUST through signed — a stock-take may correct either way', () => {
    expect(stockDelta('ADJUST', 5)).toBe(5);
    expect(stockDelta('ADJUST', -5)).toBe(-5);
  });

  it('guards on-hand from going negative', () => {
    expect(stockStaysNonNegative(3, -3)).toBe(true);
    expect(stockStaysNonNegative(3, -4)).toBe(false);
    expect(stockStaysNonNegative(0, 5)).toBe(true);
  });
});

describe('purchase-order state machine', () => {
  it('walks DRAFT → SENT → RECEIVED', () => {
    expect(canTransitionPo('DRAFT', 'SENT')).toBe(true);
    expect(canTransitionPo('SENT', 'RECEIVED')).toBe(true);
  });

  it('allows cancelling a DRAFT or a SENT order', () => {
    expect(canTransitionPo('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionPo('SENT', 'CANCELLED')).toBe(true);
  });

  it('cannot receive a DRAFT directly, nor re-open terminals', () => {
    expect(canTransitionPo('DRAFT', 'RECEIVED')).toBe(false);
    expect(canTransitionPo('RECEIVED', 'SENT')).toBe(false);
    expect(canTransitionPo('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('only a DRAFT is editable', () => {
    expect(poIsEditable('DRAFT')).toBe(true);
    expect(poIsEditable('SENT')).toBe(false);
    expect(poIsEditable('RECEIVED')).toBe(false);
  });

  it('assert throws on an illegal move', () => {
    expect(() => assertPoTransition('DRAFT', 'SENT')).not.toThrow();
    expect(() => assertPoTransition('RECEIVED', 'SENT')).toThrow(/cannot move from/);
  });
});

describe('PO money + numbering', () => {
  it('computes line and order totals in integer paise', () => {
    const { lines, totalPaise } = computePoTotals([
      { itemId: 'a', nameSnapshot: 'Rice', unitSnapshot: 'kg', qty: 3, unitPricePaise: 5000 },
      { itemId: 'b', nameSnapshot: 'Oil', unitSnapshot: 'L', qty: 2, unitPricePaise: 12000 },
    ]);
    expect(lines[0].lineTotalPaise).toBe(15000);
    expect(lines[1].lineTotalPaise).toBe(24000);
    expect(totalPaise).toBe(39000);
  });

  it('zero-pads the PO number to five', () => {
    expect(formatPoNumber(1)).toBe('PO-00001');
    expect(formatPoNumber(123)).toBe('PO-00123');
    expect(formatPoNumber(123456)).toBe('PO-123456');
  });
});
