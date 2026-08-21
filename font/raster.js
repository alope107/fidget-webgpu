import { arrayEq } from "./array.js";
import { toClip } from "./scale.js";
import { uint8RGBtoF32 } from "./color.js";


// TODO: this should really actually be happening in a shader, huh?
// I could just be taking the texture directly....
// .. Although this allows us to precompute needed pixel count

// extracts sparse array of pixels and colors, excluding fully transparent pixels
// and pixels matching background color
export const extractPixels = (canvas, backgroundColor, colorTransform=uint8RGBtoF32) => {
    const ctx = canvas.getContext("2d");
    // assuming sRGB for now
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const CHANNEL_COUNT = 4;
    const pixels = [];
    for(let pixel = 0; pixel < canvas.width * canvas.height; pixel++) {
        const idx = pixel * CHANNEL_COUNT;
        const color = [...data.slice(idx, idx+CHANNEL_COUNT)]; // idk if conversion to js arr is actually needed
        if(!arrayEq(color, backgroundColor) && color[3] > 0) {
            pixels.push({
                position: toClip({row: Math.trunc(pixel/canvas.width), col: pixel % canvas.width}, 
                                {width: canvas.width, height: canvas.height}),
                color: colorTransform(color)
            });
        }
    }
    return pixels;
};