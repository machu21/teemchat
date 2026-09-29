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
  const evalRes = await send("Runtime.evaluate", {
    expression: `(() => {
      const allTextElements = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (text && node.parentElement) {
          const rect = node.parentElement.getBoundingClientRect();
          allTextElements.push({ text, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
        }
      }
      return {
        elements: allTextElements.filter(e => e.text.includes("Guest") || e.text.includes("Space")),
        renderer: window.flutterCanvasKit ? "canvaskit" : "html"
      };
    })()`,
    returnByValue: true
  });

  console.log("Evaluation result:", JSON.stringify(evalRes, null, 2));

  ws.close();
  process.exit(0);
};
