/**
 * App entry — bootstraps the lottery machine, storage, and UI.
 */
import { getAllCountries } from "./countries.js";
import { LotteryMachine } from "./machine.js";
import * as storage from "./storage.js";
import { UI } from "./ui.js";

const $loading = document.getElementById("loading-msg");

function showError(err) {
  console.error(err);
  if ($loading) {
    $loading.textContent = "Failed to load: " + (err?.message || err);
    $loading.style.color = "#e05252";
  }
}

async function boot() {
  try {
    const canvas = document.getElementById("machine-canvas");
    if (!canvas) throw new Error("Canvas element not found");

    const countries = getAllCountries();
    const machine = new LotteryMachine(canvas);
    machine.addBalls(countries);

    const ui = new UI({ machine, storage, allCountries: countries });
    await ui.restore();

    if ($loading) $loading.hidden = true;
  } catch (err) {
    showError(err);
  }
}

boot();
