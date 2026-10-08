# kahan-summator

Sum a sequence of floating-point numbers while compensating for accumulated rounding error, using the Neumaier refinement of Kahan's algorithm.

## Usage

```js
import { KahanSummator } from './src/index.js';

const k = new KahanSummator();
k.add(1e16);
k.add(1);
k.add(1);
console.log(k.value()); // 10000000000000002
console.log(k.count);   // 3

// or all at once, from any iterable
const k2 = new KahanSummator().addAll([0.1, 0.2, 0.3]);
console.log(k2.value()); // ~0.6
```

`add(x)` returns `true` while the stream is finite and `false` once a non-finite value (NaN, ±Infinity) has been observed; after that all further `add` calls are no-ops and `value()` returns the recorded non-finite. `count` is the number of values passed to `add`, finite or not.

## Why this exists

Adding many `number`s in JavaScript with `+` accumulates rounding error proportional to the magnitude of the running sum — small addends are swallowed entirely once the sum is large. Kahan summation carries a compensation term that captures the rounding error of each step and folds it back into the next add, so the small values survive. This implementation uses Neumaier's refinement, which recomputes the compensation whenever the incoming value is larger in magnitude than the running sum; the classic Kahan loop loses its correction in exactly that case, and Neumaier's branch keeps it meaningful. The trade-off is one extra comparison (and, on the large-input branch, one extra fused multiply-add) per step — negligible for the long, modest-magnitude sums this targets.

## The awkward edge

Once the stream contains a non-finite value there is no meaningful sum to recover, so the summator records that value as its state and ignores everything after it. A NaN recorded later overrides a previously recorded Infinity; an Infinity does not override a NaN. If your input may contain non-finite values, check `add`'s return value or `value()` against `Number.isFinite` rather than assuming the result is always a real number.
