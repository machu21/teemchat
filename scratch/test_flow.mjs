const res = await fetch("http://127.0.0.1:62129/json");
const targets = await res.json();
const page = targets.find(t => t.type === "page");

const ws = new WebSocket(page.webSocketDebuggerUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));
  ws.send(JSON.stringify({ id: 3, method: "Page.getLayoutMetrics" }));
};

ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled") {
    console.log("[CONSOLE]", msg.params.type, msg.params.args.map(a => a.value || a.description).join(" "));
  } else if (msg.method === "Runtime.exceptionThrown") {
    console.log("[EXCEPTION]", JSON.stringify(msg.params.exceptionDetails));
  } else if (msg.id === 3) {
    console.log("Layout metrics:", msg.result.layoutViewport);
  }
};

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 2000);
