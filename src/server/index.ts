import { sql } from "./db";
import { createOnlineServer } from "./server";

const port = Number(process.env.WS_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("WS_PORT must be a valid TCP port");
createOnlineServer({ secret: process.env.GUEST_SECRET ?? "", adminToken: process.env.ADMIN_TOKEN, trustProxy: process.env.TRUST_PROXY === "1" })
  .then(server => {
    server.http.on("error", () => { console.error("online server could not listen"); process.exitCode = 1; void server.close().finally(() => sql.end()); });
    server.http.listen(port, () => console.log(`online Library on :${port}`));
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void server.close().catch(() => { console.error("online shutdown could not persist pending writes"); process.exitCode = 1; }).finally(() => sql.end());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  })
  .catch(() => { console.error("online unavailable: check GUEST_SECRET and the database"); process.exitCode = 1; void sql.end(); });
