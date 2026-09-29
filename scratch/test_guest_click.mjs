const res = await fetch("http://127.0.0.1:62129/json");
const targets = await res.json();
const page = targets.find(t => t.type === "page");

const ws = new WebSocket(page.webSocketDebuggerUrl);

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onopen = async () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));

  console.log("Clicking 'Enter as Guest' at (995, 555)...");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 995, y: 555 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 995, y: 555, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 995, y: 555, button: "left", clickCount: 1 });

  await new Promise(r => setTimeout(r, 2000));

  const shot = await send("Page.captureScreenshot");
  if (shot?.data) {
    import("fs").then(fs => {
      fs.writeFileSync("scratch/after_guest.png", Buffer.from(shot.data, "base64"));
      console.log("Saved scratch/after_guest.png");
    });
  }

  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.consoleAPICalled") {
    console.log("[CONSOLE]", msg.params.type, msg.params.args.map(a => a.value || a.description).join(" "));
  } else if (msg.method === "Runtime.exceptionThrown") {
    console.log("[EXCEPTION]", JSON.stringify(msg.params.exceptionDetails));
  } else if (msg.method === "Log.entryAdded") {
    console.log("[LOG]", msg.params.entry.level, msg.params.entry.text);
  }
};
