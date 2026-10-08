/**
 * Kahan summation with a Neumaier refinement for the compensation term.
 *
 * A plain Kahan loop adds a small `c` back into the next input. When an
 * input is large enough to dominate the running sum, that `c` can be lost
 * to rounding again during the add-back — the exact fault Kahan set out
 * to fix. Neumaier's variant re-computes the compensation whenever the
 * magnitude of the input exceeds the magnitude of the running sum, which
 * keeps the correction meaningful across a much wider range of values.
 *
 * This refinement does cost one extra comparison and, on the large-input
 * branch, one extra fused multiply-add per step. For the sums this
 * library targets — long sequences of modest doubles — that overhead is
 * negligible and the improved robustness is worth it.
 */
export class KahanSummator {
    constructor() {
        /** Running compensated sum. */
        this._sum = 0;
        /** Accumulated rounding error to be folded back in. */
        this._c = 0;
        /** Number of values observed, including non-finite ones. */
        this._count = 0;
        /** First non-finite value observed, if any (NaN or ±Infinity). */
        this._nonFinite = null;
    }

    /**
     * Absorb one value into the sum.
     *
     * Non-finite values (NaN, ±Infinity) are recorded as the final state:
     * once the stream is poisoned by a non-finite, the sum cannot recover
     * a meaningful value, and a NaN always wins over any earlier Infinity.
     * After this returns false, all further `add` calls are no-ops and
     * `value` returns the recorded non-finite value.
     *
     * @param {number} x Value to add.
     * @returns {boolean} true if the value was folded into the sum, false if
     *   a non-finite was recorded (subsequent calls are ignored).
     */
    add(x) {
        this._count++;
        if (this._nonFinite !== null) {
            // A NaN recorded later overrides a previously recorded Infinity;
            // any other non-finite is sticky once set.
            if (Number.isNaN(x)) this._nonFinite = x;
            return false;
        }
        if (!Number.isFinite(x)) {
            this._nonFinite = x;
            return false;
        }

        const t = this._sum + x;
        if (Math.abs(this._sum) >= Math.abs(x)) {
            // `this._sum` dominates: the classic Kahan correction applies.
            // Group `(this._sum - t) + x` so the two large terms cancel
            // before the small compensation is folded in; otherwise the
            // running `c` is lost when added to a large intermediate.
            this._c = this._c + ((this._sum - t) + x);
        } else {
            // `x` dominates: re-derive the compensation relative to `x` so
            // it is not lost in the large add.
            this._c = this._c + ((x - t) + this._sum);
        }
        this._sum = t;
        return true;
    }

    /**
     * Add every element of an iterable in order.
     *
     * @param {Iterable<number>} xs Values to add.
     * @returns {this} this, for chaining.
     */
    addAll(xs) {
        for (const x of xs) this.add(x);
        return this;
    }

    /**
     * Current compensated sum, or the recorded non-finite value if one
     * was observed. The compensation term is folded in lazily on read so
     * that intermediate reads do not disturb the running state.
     *
     * @returns {number}
     */
    value() {
        if (this._nonFinite !== null) return this._nonFinite;
        return this._sum + this._c;
    }

    /** Number of values passed to `add`, finite or not. */
    get count() {
        return this._count;
    }
}
