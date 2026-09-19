import { createServer } from "node:http";
import process from "node:process";
import { setInterval } from "node:timers";
// Lifecycle fixture only. No Python, GPU or ComfyUI involved.
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/system_stats")
    res.end(JSON.stringify({ system: { comfyui_version: "0.3.76" } }));
  else if (req.url === "/object_info/CheckpointLoaderSimple")
    res.end(
      JSON.stringify({
        CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } },
      }),
    );
  else {
    res.statusCode = 404;
    res.end("{}");
  }
});
if (process.argv[3] !== "never-ready")
  server.listen(Number(process.argv[2]), "127.0.0.1");
else setInterval(() => {}, 1000);
