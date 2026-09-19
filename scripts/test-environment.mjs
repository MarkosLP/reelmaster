import process from "node:process";
// Normal tests never activate an installed backend, even in a configured shell.
delete process.env.REELMASTER_COMFY_CONFIG;
