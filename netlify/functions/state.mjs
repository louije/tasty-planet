import { getStore } from "@netlify/blobs";

const STORE_NAME = "country-roulette";
const KEY = "state";

function empty() {
  return { skipped: [], accepted: [] };
}

export default async (req, context) => {
  const store = getStore(STORE_NAME);

  /* GET — return current state */
  if (req.method === "GET") {
    const state = await store.get(KEY, { type: "json" }).catch(() => null) || empty();
    return Response.json(state);
  }

  /* POST — mutate state */
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch {
      return new Response("Bad request", { status: 400 });
    }

    const state = await store.get(KEY, { type: "json" }).catch(() => null) || empty();

    if (body.action === "skip") {
      if (body.country && !state.skipped.includes(body.country)) {
        state.skipped.push(body.country);
      }
    } else if (body.action === "accept") {
      if (body.country && !state.accepted.includes(body.country)) {
        state.accepted.push(body.country);
      }
    } else if (body.action === "reset") {
      state.skipped = [];
      state.accepted = [];
    } else {
      return new Response("Unknown action", { status: 400 });
    }

    await store.setJSON(KEY, state);
    return Response.json(state);
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: "/api/state",
};
