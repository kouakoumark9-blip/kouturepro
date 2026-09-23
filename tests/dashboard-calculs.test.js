import test from 'node:test';
import assert from 'node:assert/strict';
import { previousMonth, orderBalance } from '../src/utils.js';

test('tableau de bord : mois précédent correct aux fins de mois et au changement d’année', () => {
  assert.equal(previousMonth('2026-03-31'), '2026-02');
  assert.equal(previousMonth('2026-01-31'), '2025-12');
  assert.equal(previousMonth('2024-03-01'), '2024-02');
});

test('tableau de bord : reste à encaisser calculé uniquement sur les paiements confirmés', () => {
  const order={id:'o1',price:45000};
  const payments=[{order_id:'o1',amount:10000,status:'paid'},{order_id:'o1',amount:20000,status:'pending'},{order_id:'o2',amount:1000,status:'paid'}];
  assert.equal(orderBalance(order,payments),35000);
  assert.equal(orderBalance({...order,price:9000},payments),0);
});
