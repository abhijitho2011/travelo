import {
  computeGst,
  computeGstForCategory,
  hsnFor,
  resolveGstRate,
  HOTEL_GST_SLABS,
  RESTAURANT_GST_SLABS,
  SAAS_GST_SLABS,
} from './gst';

describe('GST engine', () => {
  describe('resolveGstRate — accommodation slab boundaries', () => {
    it('applies 12% below the ₹7,500 boundary', () => {
      expect(resolveGstRate('accommodation', 500000)).toBe(12);
    });

    it('applies 12% exactly at ₹7,500 (750000 paise, inclusive)', () => {
      expect(resolveGstRate('accommodation', 750000)).toBe(12);
    });

    it('applies 18% one paise above the boundary', () => {
      expect(resolveGstRate('accommodation', 750001)).toBe(18);
    });

    it('applies 18% well above the boundary', () => {
      expect(resolveGstRate('accommodation', 1200000)).toBe(18);
    });
  });

  describe('resolveGstRate — other categories', () => {
    it('restaurant is a flat 5% regardless of amount', () => {
      expect(resolveGstRate('restaurant', 10)).toBe(5);
      expect(resolveGstRate('restaurant', 99999999)).toBe(5);
    });

    it('saas is a flat 18%', () => {
      expect(resolveGstRate('saas', 1)).toBe(18);
    });

    it('other defaults to 18%', () => {
      expect(resolveGstRate('other', 1)).toBe(18);
    });
  });

  describe('hsnFor', () => {
    it('returns SAC codes per category', () => {
      expect(hsnFor('accommodation')).toBe('996311');
      expect(hsnFor('restaurant')).toBe('996331');
      expect(hsnFor('saas')).toBe('998319');
      expect(hsnFor('other')).toBe('9983');
    });
  });

  describe('computeGst — intra vs inter-state split', () => {
    it('splits intra-state into equal CGST + SGST', () => {
      const r = computeGst({ taxableAmountPaise: 100000, ratePercent: 18, intraState: true });
      // 18% of 100000 = 18000; 9000 + 9000
      expect(r.taxPaise).toBe(18000);
      expect(r.cgstPaise).toBe(9000);
      expect(r.sgstPaise).toBe(9000);
      expect(r.igstPaise).toBe(0);
      expect(r.totalPaise).toBe(118000);
    });

    it('puts the full rate in IGST inter-state', () => {
      const r = computeGst({ taxableAmountPaise: 100000, ratePercent: 18, intraState: false });
      expect(r.taxPaise).toBe(18000);
      expect(r.igstPaise).toBe(18000);
      expect(r.cgstPaise).toBe(0);
      expect(r.sgstPaise).toBe(0);
      expect(r.totalPaise).toBe(118000);
    });

    it('taxPaise is identical intra vs inter for the same base+rate', () => {
      const intra = computeGst({ taxableAmountPaise: 123457, ratePercent: 12, intraState: true });
      const inter = computeGst({ taxableAmountPaise: 123457, ratePercent: 12, intraState: false });
      expect(intra.taxPaise).toBe(inter.taxPaise);
    });
  });

  describe('computeGst — rounding invariants (no drift)', () => {
    it('cgst + sgst === taxPaise for an odd tax amount', () => {
      // 5% of 100001 = 5000.05 → rounds to 5000; split 2500 + 2500
      const r = computeGst({ taxableAmountPaise: 100001, ratePercent: 5, intraState: true });
      expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
    });

    it('odd paise goes to CGST so the halves still sum exactly', () => {
      // Pick a base whose rounded tax is odd. 18% of 123455 = 22221.9 → 22222 (even)
      // 18% of 123450 = 22221 (odd)
      const r = computeGst({ taxableAmountPaise: 123450, ratePercent: 18, intraState: true });
      expect(r.taxPaise).toBe(22221);
      expect(r.sgstPaise).toBe(11110); // floor(22221/2)
      expect(r.cgstPaise).toBe(11111); // remainder
      expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
    });

    it('brute-force: cgst+sgst always equals taxPaise across many bases', () => {
      for (let base = 0; base <= 20000; base += 7) {
        for (const rate of [5, 12, 18]) {
          const r = computeGst({ taxableAmountPaise: base, ratePercent: rate, intraState: true });
          expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
          expect(r.igstPaise).toBe(0);
          expect(r.totalPaise).toBe(base + r.taxPaise);
        }
      }
    });

    it('rounds to whole paise (half-up via Math.round)', () => {
      // 5% of 10 = 0.5 → 1
      expect(
        computeGst({ taxableAmountPaise: 10, ratePercent: 5, intraState: false }).taxPaise,
      ).toBe(1);
    });
  });

  describe('computeGstForCategory', () => {
    it('resolves rate + hsn and computes the breakdown', () => {
      const r = computeGstForCategory({
        category: 'accommodation',
        taxableAmountPaise: 800000,
        intraState: true,
      });
      expect(r.ratePercent).toBe(18); // above ₹7,500
      expect(r.hsnCode).toBe('996311');
      expect(r.taxPaise).toBe(144000);
      expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
      expect(r.totalPaise).toBe(944000);
    });

    it('uses the 12% slab at the boundary', () => {
      const r = computeGstForCategory({
        category: 'accommodation',
        taxableAmountPaise: 750000,
        intraState: false,
      });
      expect(r.ratePercent).toBe(12);
      expect(r.igstPaise).toBe(90000);
    });
  });

  describe('slab config shape', () => {
    it('every category ends in an open-ended (null) slab', () => {
      for (const slabs of [HOTEL_GST_SLABS, RESTAURANT_GST_SLABS, SAAS_GST_SLABS]) {
        expect(slabs[slabs.length - 1].maxAmountPaise).toBeNull();
      }
    });
  });
});
