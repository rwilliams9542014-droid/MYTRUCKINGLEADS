export function isDatabaseUnavailableError(err = {}) {
  const message = String(err.message || "").toLowerCase();
  return (
    message.includes("connection terminated due to connection timeout") ||
    message.includes("no space left on device") ||
    message.includes("the database system is starting up") ||
    message.includes("connection refused") ||
    message.includes("econnreset") ||
    message.includes("terminating connection due to administrator command") ||
    err.code === "53100" ||
    err.code === "57P03" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED"
  );
}
