export const uint8RGBtoF32 = (uint8Color) => {
    return uint8Color.map(e => e/255);
};