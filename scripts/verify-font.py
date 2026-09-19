"""Optional font coverage audit using fontTools (not required by the renderer)."""
from fontTools.ttLib import TTFont
font = TTFont('public/ReelSans.woff2')
required = '\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1\u00bf\u00a1'
cmap = font.getBestCmap()
missing = [f'U+{ord(char):04X}' for char in required if ord(char) not in cmap]
assert not missing, missing
print('PASS: all 9 required Spanish codepoints exist in the bundled font cmap')
