import { createServer } from "node:net";

const server = createServer();
server.unref();
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Unable to allocate an E2E application port.");
    process.exitCode = 1;
    server.close();
    return;
  }
  // Stringify: piped Numbers pick up ANSI color codes when FORCE_COLOR is set,
  // which breaks the caller's `^\d+$` check.
  console.log(String(address.port));
  server.close();
});
