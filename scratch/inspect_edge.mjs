const res = await fetch("http://127.0.0.1:62129/json");
const targets = await res.json();
const page = targets.find(t => t.type === "page");
if (!page) {
  console.log("No page found");
  process.exit(1);
}

console.log("Connecting to:", page.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));
  // Evaluate document text or any unhandled exceptions
  ws.send(JSON.stringify({
    id: 3,
    method: "Runtime.evaluate",
    params: {
      expression: `(() => {
        return {
          title: document.title,
          bodyText: document.body.innerText.slice(0, 1000),
          url: window.location.href,
          hasFlutter: !!window._flutter
        };
      })()`,
      returnByValue: true
    }
  }));

  // Capture screenshot as base64
  ws.send(JSON.stringify({ id: 4, method: "Page.captureScreenshot" }));
};

let captured = false;

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled") {
    console.log("[CONSOLE]", msg.params.type, msg.params.args.map(a => a.value || a.description).join(" "));
  } else if (msg.method === "Runtime.exceptionThrown") {
    console.log("[EXCEPTION]", JSON.stringify(msg.params.exceptionDetails));
  } else if (msg.method === "Log.entryAdded") {
    console.log("[LOG]", msg.params.entry.level, msg.params.entry.text);
  } else if (msg.id === 3) {
    console.log("[PAGE STATE]", JSON.stringify(msg.result?.result?.value, null, 2));
  } else if (msg.id === 4 && msg.result?.data) {
    import("fs").then(fs => {
      fs.writeFileSync("scratch/edge_screen.png", Buffer.from(msg.result.data, "base64"));
      console.log("Saved scratch/edge_screen.png");
    });
  }
};

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 3000);
