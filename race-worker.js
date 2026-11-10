// RPC envelope around the pinned, unmodified Umalator worker. The client queues requests.
// Set composition arrived after Node 20 and some otherwise supported browsers.
if (!Set.prototype.union) Object.defineProperty(Set.prototype, "union", { configurable: true, writable: true,
  value: function(other) { const result = new Set(this); for(const value of other.keys()) result.add(value); return result; } });
if (!Set.prototype.intersection) Object.defineProperty(Set.prototype, "intersection", { configurable: true, writable: true,
  value: function(other) { const result = new Set(); for(const value of this) if(other.has(value)) result.add(value); return result; } });
let simulateMessage;
const listen = self.addEventListener.bind(self);
self.addEventListener = (type, handler) => { if (type === "message") simulateMessage = handler; };
importScripts("vendor/umalator/simulator.worker.js" + new URL(self.location.href).search);
self.addEventListener = listen;
listen("message", event => {
  try { simulateMessage(event); self.postMessage({ type: "done" }); }
  catch (error) { self.postMessage({ type: "error", error: error.message || String(error) }); }
});
