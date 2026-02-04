/**
 * UI controller — wires DOM elements to the machine + storage.
 */
import { countryColorCSS } from "./countries.js";

export class UI {
  constructor({ machine, storage, allCountries }) {
    this._machine = machine;
    this._storage = storage;
    this._all = allCountries;
    this._pending = null;

    this.$remaining    = document.getElementById("remaining-count");
    this.$overlay      = document.getElementById("selection-overlay");
    this.$name         = document.getElementById("selected-name");
    this.$continent    = document.getElementById("selected-continent");
    this.$btnSpin      = document.getElementById("btn-spin");
    this.$btnSkip      = document.getElementById("btn-skip");
    this.$btnAccept    = document.getElementById("btn-accept");
    this.$btnReset     = document.getElementById("btn-reset");
    this.$acceptedList = document.getElementById("accepted-list");
    this.$acceptedEmpty= document.getElementById("accepted-empty");
    this.$skippedList  = document.getElementById("skipped-list");
    this.$skippedCount = document.getElementById("skipped-count");
    this.$shakeHint    = document.getElementById("shake-hint");

    this._bind();
    this._initAccel();
  }

  _bind() {
    /* Spin button: press-and-hold to shake, release to open trapdoor.
       Quick tap falls back to auto-spin. */
    let pressTimer = null;
    let held = false;

    this.$btnSpin.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this._machine.isSpinning) return;
      held = false;
      pressTimer = setTimeout(() => {
        held = true;
        this._machine.startShake();
        this._shakeLoop();
        this.$btnSpin.textContent = "Release!";
      }, 200);
    });

    const onRelease = () => {
      clearTimeout(pressTimer);
      if (held) {
        held = false;
        this._machine.release();
        this.$btnSpin.textContent = "Shake";
        this.$btnSpin.disabled = true;
      }
    };
    this.$btnSpin.addEventListener("pointerup", onRelease);
    this.$btnSpin.addEventListener("pointerleave", onRelease);

    // Quick tap → auto spin
    this.$btnSpin.addEventListener("click", () => {
      if (held) return;
      if (this._machine.isSpinning) return;
      this._hideOverlay();
      this._machine.clearHighlight();
      this.$btnSpin.disabled = true;
      this._machine.spin();
    });

    this.$btnSkip.addEventListener("click", () => this._decide("skip"));
    this.$btnAccept.addEventListener("click", () => this._decide("accept"));
    this.$btnReset.addEventListener("click", () => this._reset());

    this._machine.onSelect((country) => this._onCountrySelected(country));
  }

  /** Continuous random shaking while holding the button */
  _shakeLoop() {
    if (this._machine._state !== "shaking") return;
    this._machine.applyShake(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.3) * 1.5,
      (Math.random() - 0.5) * 2,
    );
    requestAnimationFrame(() => this._shakeLoop());
  }

  async _initAccel() {
    const ok = await this._machine.enableAccelerometer();
    if (ok && this.$shakeHint) {
      this.$shakeHint.hidden = false;
    }
  }

  _onCountrySelected(country) {
    this._pending = country;
    this.$name.textContent = country.name;
    this.$continent.textContent = country.continent;
    this._showOverlay();
    this.$btnSpin.disabled = false;
    this.$btnSpin.textContent = "Shake";
  }

  async _decide(action) {
    if (!this._pending) return;
    const c = this._pending;
    this._pending = null;
    this._hideOverlay();
    this._machine.removeBall(c.code);
    this._machine.resetAfterSelection();

    await this._storage.saveAction(action, c.code);
    if (action === "accept") this._addToAccepted(c);
    else this._addToSkipped(c);
    this._updateCount();
  }

  async _reset() {
    if (!confirm("Reset all progress? This cannot be undone.")) return;
    await this._storage.resetState();
    location.reload();
  }

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

  async restore() {
    const state = await this._storage.loadState();
    for (const code of [...state.skipped, ...state.accepted]) {
      this._machine.removeBall(code);
    }
    for (const code of [...state.accepted].reverse()) {
      const c = this._all.find(x => x.code === code);
      if (c) this._addToAccepted(c);
    }
    for (const code of state.skipped) {
      const c = this._all.find(x => x.code === code);
      if (c) this._addToSkipped(c);
    }
    this._updateCount();
  }
}
