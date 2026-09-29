/**
 * Odoo JSON-RPC client.
 * Reuses the session cookie stored in the Puppeteer profile, then talks to Odoo without a browser.
 */

const CONFIG = require("../config");
const { withBrowser } = require("../utils");

const BASE_URL = new URL(CONFIG.urls.login).origin;

function notLoggedIn(detail) {
  const err = new Error(`Not logged in to Bemo${detail ? ` (${detail})` : ""}. Run: npm run auth`);
  err.code = "BEMO_NOT_LOGGED_IN";
  return err;
}

/**
 * Read the Odoo session cookie from the persistent browser profile
 * @returns {Promise<string>} session_id value (never log it)
 */
async function readSessionCookie() {
  return withBrowser(CONFIG, true, async (page) => {
    const cookie = (await page.cookies(BASE_URL)).find((c) => c.name === "session_id");
    if (!cookie) throw notLoggedIn("no session cookie");
    return cookie.value;
  });
}

/**
 * Create a low-level client bound to a session
 * @param {string} sessionId - Odoo session_id cookie
 * @param {Object} options - Options
 * @param {function} [options.fetchImpl=fetch] - fetch implementation (tests)
 * @returns {{call: function, callKw: function}}
 */
function createClient(sessionId, { fetchImpl = fetch } = {}) {
  let requestId = 0;

  async function call(route, params) {
    const res = await fetchImpl(`${BASE_URL}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: ++requestId, params }),
    });
    if (!res.ok) throw new Error(`Bemo RPC ${route} failed: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) {
      const name = body.error.data?.name || "";
      if (name.includes("SessionExpired")) throw notLoggedIn("session expired");
      const err = new Error(body.error.data?.message || body.error.message || "Unknown Odoo error");
      err.odooName = name;
      throw err;
    }
    return body.result;
  }

  const callKw = (model, method, args = [], kwargs = {}) =>
    call(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs });

  return { call, callKw };
}

/**
 * Open a connection: session cookie + user info + the context the web client sends
 * @param {Object} options - Options
 * @param {string} [options.sessionId] - Skip reading the browser profile
 * @returns {Promise<{rpc: Object, uid: number, tz: string, context: Object}>}
 */
async function connect({ sessionId } = {}) {
  const rpc = createClient(sessionId || (await readSessionCookie()));
  const info = await rpc.call("/web/session/get_session_info", {});
  if (!info?.uid) throw notLoggedIn("no user in session");

  const tz = info.user_context?.tz || "UTC";
  const current = info.user_companies?.current_company?.[0];
  const allowed = (info.user_companies?.allowed_companies || []).map(([id]) => id);
  // Web client order: current company first, then the other allowed ones.
  const allowedCompanyIds = current ? [current, ...allowed.filter((id) => id !== current)] : allowed;

  return {
    rpc,
    uid: info.uid,
    tz,
    context: { ...info.user_context, ...(allowedCompanyIds.length ? { allowed_company_ids: allowedCompanyIds } : {}) },
  };
}

module.exports = { BASE_URL, createClient, connect, readSessionCookie };
