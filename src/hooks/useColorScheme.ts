import {PALETTES, type PaletteKey, type Palette} from "../presets/colors";

export const useColorScheme = (palette: PaletteKey = "dark"): Palette => {
  return PALETTES[palette];
};
