/**
 * UI controller — wires DOM elements to the machine + storage.
 */
import { countryColorCSS } from "./countries.js";

export class UI {
  /**
   * @param {object} deps
   * @param {import('./machine.js').LotteryMachine} deps.machine
   * @param {object} deps.storage  — { loadState, saveAction, resetState }
   * @param {{ code: string, name: string, continent: string }[]} deps.allCountries
   */
  constructor({ machine, storage, allCountries }) {
    this._machine = machine;
    this._storage = storage;
    this._all = allCountries;
    this._pending = null; // country waiting for skip/accept

    /* DOM refs */
    this.$remaining    = document.getElementById("remaining-count");
    this.$overlay      = document.getElementById("selection-overlay");
    this.$name         = document.getElementById("selected-name");
    this.$continent    = document.getElementById("selected-continent");
    this.$btnSpin      = document.getElementById("btn-spin");
    this.$btnSkip      = document.getElementById("btn-skip");
    this.$btnAccept    = document.getElementById("btn-accept");
    this.$btnReset     = document.getElementById("btn-reset");
    this.$btnTest      = document.getElementById("btn-test-rng");
    this.$rngOut       = document.getElementById("rng-output");
    this.$acceptedList = document.getElementById("accepted-list");
    this.$acceptedEmpty= document.getElementById("accepted-empty");
    this.$skippedList  = document.getElementById("skipped-list");
    this.$skippedCount = document.getElementById("skipped-count");

    this._bind();
  }

  _bind() {
    this.$btnSpin.addEventListener("click", () => this._spin());
    this.$btnSkip.addEventListener("click", () => this._decide("skip"));
    this.$btnAccept.addEventListener("click", () => this._decide("accept"));
    this.$btnReset.addEventListener("click", () => this._reset());
    this.$btnTest.addEventListener("click", () => this._testRNG());

    this._machine.onSelect((country) => this._onCountrySelected(country));
  }

  /* ---- actions ---- */

  _spin() {
    if (this._machine.isSpinning) return;
    this._hideOverlay();
    this._machine.clearHighlight();
    this.$btnSpin.disabled = true;
    this._machine.spin();
  }

  _onCountrySelected(country) {
    this._pending = country;
    this.$name.textContent = country.name;
    this.$continent.textContent = country.continent;
    this._showOverlay();
    this.$btnSpin.disabled = false;
  }

  async _decide(action) {
    if (!this._pending) return;
    const c = this._pending;
    this._pending = null;
    this._hideOverlay();
    this._machine.clearHighlight();
    this._machine.removeBall(c.code);

    await this._storage.saveAction(action, c.code);

    if (action === "accept") {
      this._addToAccepted(c);
    } else {
      this._addToSkipped(c);
    }
    this._updateCount();
  }

  async _reset() {
    if (!confirm("Reset all progress? This cannot be undone.")) return;
    await this._storage.resetState();
    location.reload();
  }

  /* ---- rendering ---- */

  _addToAccepted(c) {
    this.$acceptedEmpty.hidden = true;
    const li = document.createElement("li");
    li.innerHTML = `<span class="country-dot" style="background:${countryColorCSS(c.code, c.continent)}"></span>${c.name}`;
    this.$acceptedList.prepend(li);
  }

  _addToSkipped(c) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="country-dot" style="background:${countryColorCSS(c.code, c.continent)}"></span>${c.name}`;
    this.$skippedList.append(li);
    this.$skippedCount.textContent = this.$skippedList.children.length;
  }

  _updateCount() {
    this.$remaining.textContent = this._machine.ballCount;
  }

  _showOverlay() {
    this.$overlay.classList.remove("hidden");
    this.$btnAccept.focus();
  }

  _hideOverlay() {
    this.$overlay.classList.add("hidden");
  }

  /* ---- restore persisted state ---- */
  async restore() {
    const state = await this._storage.loadState();

    const skipSet = new Set(state.skipped);
    const acceptSet = new Set(state.accepted);

    // Remove persisted countries from the machine
    for (const code of [...skipSet, ...acceptSet]) {
      this._machine.removeBall(code);
    }

    // Render accepted list (most recent first)
    for (const code of [...state.accepted].reverse()) {
      const c = this._all.find((x) => x.code === code);
      if (c) this._addToAccepted(c);
    }

    // Render skipped list
    for (const code of state.skipped) {
      const c = this._all.find((x) => x.code === code);
      if (c) this._addToSkipped(c);
    }

    this._updateCount();
  }

  /* ---- Randomness test ---- */
  _testRNG() {
    const N = 100_000;
    const buckets = 197;
    const counts = new Array(buckets).fill(0);
    const arr = new Uint32Array(1);

    for (let i = 0; i < N; i++) {
      // Same algorithm as machine._cryptoRandomIndex
      const mask = (1 << Math.ceil(Math.log2(buckets))) - 1;
      let val;
      do {
        crypto.getRandomValues(arr);
        val = arr[0] & mask;
      } while (val >= buckets);
      counts[val]++;
    }

    const expected = N / buckets;
    let chiSq = 0;
    let min = Infinity, max = -Infinity;
    for (const c of counts) {
      chiSq += (c - expected) ** 2 / expected;
      if (c < min) min = c;
      if (c > max) max = c;
    }

    // chi-squared critical value for df=196, alpha=0.05 ≈ 232.9
    const pass = chiSq < 233;

    this.$rngOut.textContent =
      `Chi-squared test (${N.toLocaleString()} draws, ${buckets} buckets):\n` +
      `  X² = ${chiSq.toFixed(2)}  (critical ≈ 233)\n` +
      `  min = ${min}, max = ${max}, expected ≈ ${expected.toFixed(1)}\n` +
      `  Result: ${pass ? "PASS — distribution is uniform" : "FAIL — investigate"}`;
  }
}
