import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
export const spanishProbe = "áéíóúüñ¿¡";
if (typeof document !== "undefined") {
  const handle = delayRender("Loading bundled Inter including Spanish glyphs");
  const font = new FontFace(
    "ReelSans",
    `url(${staticFile("ReelSans.woff2")})`,
    { weight: "100 900" },
  );
  font
    .load()
    .then(async (loaded) => {
      document.fonts.add(loaded);
      await document.fonts.load("700 49px ReelSans", spanishProbe);
      if (!document.fonts.check("700 49px ReelSans", spanishProbe))
        throw new Error("Spanish font load failed");
      continueRender(handle);
    })
    .catch(cancelRender);
}
