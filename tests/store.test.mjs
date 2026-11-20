import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { demoTopUp, getPublicState, purchasePlan, resetStoreForTests } from '../apps/api/store.mjs';

beforeEach(() => resetStoreForTests());

test('demo top up increases balance', () => {
  const state = demoTopUp('101', 1000);
  assert.equal(state.user.balance, 1000);
});

test('purchase rejects insufficient balance', () => {
  assert.throws(() => purchasePlan('101', 'week'), /Недостаточно/);
});

test('purchase creates active subscription and deducts price', () => {
  demoTopUp('101', 1000);
  const state = purchasePlan('101', 'week', 'request-1');
  assert.equal(state.user.balance, 851);
  assert.equal(state.user.subscription.status, 'active');
  assert.equal(state.user.subscription.planId, 'week');
});

test('purchase is idempotent for same request id', () => {
  demoTopUp('101', 1000);
  const first = purchasePlan('101', 'week', 'request-1');
  const second = purchasePlan('101', 'week', 'request-1');
  assert.equal(second.user.balance, first.user.balance);
  assert.equal(second.transactions.length, first.transactions.length);
});

test('public state does not expose internal collections', () => {
  const state = getPublicState('101');
  assert.equal('users' in state, false);
  assert.equal(state.plans.length, 3);
});
