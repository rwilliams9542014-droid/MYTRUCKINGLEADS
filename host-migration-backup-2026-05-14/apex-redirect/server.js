const http = require("http");

const port = Number(process.env.PORT) || 8080;
const canonicalHost = process.env.CANONICAL_HOST || "www.mytruckingleads.com";

function buildRedirectUrl(req) {
  const requestUrl = new URL(req.url || "/", `http://${canonicalHost}`);
  return `https://${canonicalHost}${requestUrl.pathname}${requestUrl.search}`;
}

const server = http.createServer((req, res) => {
  if ((req.url || "/") === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, host: canonicalHost }));
    return;
  }

  res.writeHead(308, {
    Location: buildRedirectUrl(req),
    "Cache-Control": "public, max-age=300",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(`Redirecting to https://${canonicalHost}`);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Apex redirect listening on ${port}`);
});
