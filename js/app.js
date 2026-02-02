/**
 * App entry — bootstraps the lottery machine, storage, and UI.
 */
import { getAllCountries } from "./countries.js";
import { LotteryMachine } from "./machine.js";
import * as storage from "./storage.js";
import { UI } from "./ui.js";

async function boot() {
  const canvas = document.getElementById("machine-canvas");
  if (!canvas) { console.error("Canvas not found"); return; }

  /* 1. Get the full country list */
  const countries = getAllCountries();

  /* 2. Create the 3D lottery machine */
  const machine = new LotteryMachine(canvas);

  /* 3. Add all country balls */
  machine.addBalls(countries);

  /* 4. Wire UI */
  const ui = new UI({ machine, storage, allCountries: countries });

  /* 5. Restore persisted state (remove already-skipped/accepted balls) */
  await ui.restore();
}

boot().catch(console.error);
