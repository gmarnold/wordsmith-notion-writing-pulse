import { config } from "./config.js";
import { buildServer } from "./server.js";

const server = buildServer();

await server.listen({ port: config.API_PORT, host: "0.0.0.0" });
