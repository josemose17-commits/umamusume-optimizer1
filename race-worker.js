// RPC envelope around the pinned, unmodified Umalator worker. The client queues requests.
// ?sim=<variant>: a JP-dated cup's simulator instead (cm22 on, League of Heroes): the pinned JP
// worker (vendor/umalator-jp) with that cup's skill versions and stamina showdown rules
// (data/race-variants/<variant>.json), applied by race-variants.js.
// Set composition arrived after Node 20 and some otherwise supported browsers.
if (!Set.prototype.union) Object.defineProperty(Set.prototype, "union", { configurable: true, writable: true,
  value: function(other) { const result = new Set(this); for(const value of other.keys()) result.add(value); return result; } });
if (!Set.prototype.intersection) Object.defineProperty(Set.prototype, "intersection", { configurable: true, writable: true,
  value: function(other) { const result = new Set(); for(const value of this) if(other.has(value)) result.add(value); return result; } });
let simulateMessage, loadError = null;
const listen = self.addEventListener.bind(self);
const here = new URL(self.location.href), version = here.searchParams.get("v") ? "?v=" + here.searchParams.get("v") : "";
const sim = here.searchParams.get("sim");
function readText(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send();
  if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) throw new Error("Race data did not load (" + url.split("?")[0] + ").");
  return xhr.responseText;
}
self.addEventListener = (type, handler) => { if (type === "message") simulateMessage = handler; };
try {
  if (sim) {
    if (!/^[\w-]+$/.test(sim)) throw new Error("Unknown simulator variant.");
    importScripts("race-variants.js" + version);
    const variant = JSON.parse(readText("data/race-variants/" + sim + ".json" + version));
    (0, eval)(self.UmaRaceVariants.patch(readText("vendor/umalator-jp/simulator.worker.js" + version), variant));
  } else importScripts("vendor/umalator/simulator.worker.js" + version);
} catch (error) { loadError = error.message || String(error); }
self.addEventListener = listen;
listen("message", event => {
  try { if (loadError) throw new Error(loadError); simulateMessage(event); self.postMessage({ type: "done" }); }
  catch (error) { self.postMessage({ type: "error", error: error.message || String(error) }); }
});
