// Loaded before the CLI/dependencies. Fail closed on outbound TCP connections.
import net from "node:net";
import process from "node:process";
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const options = typeof first === "object" && first !== null ? first : {};
  const host =
    options.host ??
    (typeof normalized[1] === "string" ? normalized[1] : "localhost");
  const pipe =
    options.path ??
    (typeof first === "string" && !/^\d+$/.test(first) ? first : undefined);
  if (!pipe && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host))
    throw new Error("FASE 1A: outbound network disabled");
  return connect.apply(this, args);
};
process.env.HF_HUB_OFFLINE = "1";
process.env.TRANSFORMERS_OFFLINE = "1";
