import { describe, expect, it } from 'vitest';
import { weexBook } from './spot';

describe('livro da WEEX (snapshot + mudanças)', () => {
  it('aplica a foto e depois as mudanças; tamanho 0 remove o nível', () => {
    const b = weexBook();
    b.apply({ bids: [{ price: '100', size: '1' }, { price: '99', size: '2' }], asks: [{ price: '101', size: '3' }] }, true);
    const q = b.apply({ bids: [{ price: '100', size: '0' }, { price: '99.5', size: '5' }], asks: [] }, false)!;
    expect(q.bid).toBe(99.5);
    expect(q.bids).toEqual([
      [99.5, 5],
      [99, 2],
    ]);
    expect(q.ask).toBe(101);
  });
  it('nova foto apaga o livro anterior', () => {
    const b = weexBook();
    b.apply({ bids: [{ price: '100', size: '1' }], asks: [{ price: '101', size: '1' }] }, true);
    const q = b.apply({ bids: [{ price: '50', size: '1' }], asks: [{ price: '51', size: '1' }] }, true)!;
    expect(q.bids).toEqual([[50, 1]]);
  });
});
