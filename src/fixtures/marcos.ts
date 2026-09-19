export const paragraphs = [
  "La inteligencia artificial está cambiando muchísimo más rápido de lo que pensamos.",
  "Pero no necesitas ser programador ni saber de tecnología para empezar a utilizarla.",
  "Mi objetivo es enseñarte herramientas de inteligencia artificial de una forma sencilla, práctica y fácil de entender.",
  "Vamos a probar cosas nuevas, descubrir qué podemos hacer con ellas y, sobre todo, aprender juntos.",
  "Porque esto acaba de empezar.",
];
export const headlines = [
  "La IA cambia.\nTú también puedes.",
  "No necesitas\nser programador.",
  "Sencilla.\nPráctica.\nPara ti.",
  "Probamos.\nDescubrimos.\nAprendemos.",
  "Esto acaba\nde empezar.",
];
// Verified source fixture. Refuse a different recording rather than guessing cuts.
export const originalHash =
  "625e39714ca1a420b2442b4a387ce9b736e46b76f4c3117be04fbd1b50d9b231";
export const segmentationRecipe = {
  version: "marcos-paragraph-pauses-v1",
  noiseDb: -32,
  minSilenceSeconds: 0.18,
  minSceneGapMs: 460,
  expectedSceneCount: 5,
};
