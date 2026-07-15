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
  console.log(address.port);
  server.close();
});
