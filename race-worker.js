// RPC envelope around the pinned, unmodified Umalator worker. The client queues requests.
let simulateMessage;
const listen = self.addEventListener.bind(self);
self.addEventListener = (type, handler) => { if (type === "message") simulateMessage = handler; };
importScripts("vendor/umalator/simulator.worker.js" + new URL(self.location.href).search);
self.addEventListener = listen;
listen("message", event => {
  try { simulateMessage(event); self.postMessage({ type: "done" }); }
  catch (error) { self.postMessage({ type: "error", error: error.message || String(error) }); }
});
