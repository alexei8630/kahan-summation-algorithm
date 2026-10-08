import { strict as assert } from 'node:assert';
import test from 'node:test';
import { KahanSummator } from '../src/index.js';

// A pair of values whose true sum is exactly 2 but whose in-order
// floating-point sum drifts by one ULP when computed in isolation and
// the large value comes first.
const a = 1e16;
const b = 1;
const c = 1;

/** Return true when `x` and `y` differ by no more than `n` ULPs. */
function withinULP(x, y, n = 1) {
    if (Object.is(x, y)) return true;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= n * Math.ulp(Math.max(Math.abs(x), Math.abs(y)));
}

// `Math.ulp` is not standard; supply a minimal shim here.
if (typeof Math.ulp !== 'function') {
    Math.ulp = function (x) {
        if (x === 0) return Number.MIN_VALUE;
        const e = Math.getExponent ? Math.getExponent(x) : Math.floor(Math.log2(Math.abs(x)));
        return Math.pow(2, e - 52);
    };
}

test('sums a simple array of small numbers exactly', () => {
    const k = new KahanSummator().addAll([0.1, 0.2, 0.3]);
    assert.ok(withinULP(k.value(), 0.6, 2));
});

test('recovers a ULP the naive sum loses on large-then-small ordering', () => {
    const naive = a + b + c;
    const kahan = new KahanSummator().addAll([a, b, c]);
    // Naive IEEE-754 binary64 sum of [1e16, 1, 1] is 1e16, dropping both
    // unit adds. Kahan must hold onto them.
    assert.equal(naive, a);
    assert.equal(kahan.value(), a + 2);
});

test('add returns true while the stream is finite', () => {
    const k = new KahanSummator();
    assert.equal(k.add(1), true);
    assert.equal(k.add(2), true);
    assert.equal(k.value(), 3);
});

test('NaN poisons the sum and is returned by value', () => {
    const k = new KahanSummator();
    k.add(1);
    assert.equal(k.add(NaN), false);
    assert.ok(Number.isNaN(k.value()));
    assert.equal(k.add(2), false);
    assert.ok(Number.isNaN(k.value()));
});

test('Infinity poisons the sum and NaN overrides it', () => {
    const k = new KahanSummator();
    k.add(1);
    assert.equal(k.add(Infinity), false);
    assert.equal(k.value(), Infinity);
    assert.equal(k.add(NaN), false);
    assert.ok(Number.isNaN(k.value()));
});

test('negative infinity is preserved as the non-finite value', () => {
    const k = new KahanSummator();
    k.add(-5);
    assert.equal(k.add(-Infinity), false);
    assert.equal(k.value(), -Infinity);
});

test('count includes every value passed to add, including non-finite', () => {
    const k = new KahanSummator().addAll([1, 2, NaN, 3]);
    assert.equal(k.count, 4);
    assert.ok(Number.isNaN(k.value()));
});

test('empty summator has value 0 and count 0', () => {
    const k = new KahanSummator();
    assert.equal(k.value(), 0);
    assert.equal(k.count, 0);
});

test('value does not mutate running state across reads', () => {
    const k = new KahanSummator().addAll([1, 2, 3]);
    assert.equal(k.value(), 6);
    assert.equal(k.value(), 6);
    k.add(4);
    assert.equal(k.value(), 10);
});

test('addAll accepts a generator', () => {
    function* gen() {
        yield 1; yield 2; yield 3;
    }
    const k = new KahanSummator().addAll(gen());
    assert.equal(k.value(), 6);
    assert.equal(k.count, 3);
});

test('mixed large and small values keep their small contributions', () => {
    const xs = [1e16, 1, -1e16, 1];
    const k = new KahanSummator().addAll(xs);
    // Naive order-dependent sum here is 0 (the 1s are lost against 1e16
    // and then subtracted away). Kahan preserves both unit adds and ends
    // at 2.
    assert.equal(k.value(), 2);
});

test('default export is the same class as the named export', async () => {
    const mod = await import('../src/index.js');
    assert.equal(mod.default, mod.KahanSummator);
});
