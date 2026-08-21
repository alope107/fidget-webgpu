import { circleStruct } from "./structs.js";
import { randRange, randClip } from "../shared/js/random.js"

export const randColor = () => [Math.random(), Math.random(), Math.random(), 1.];
export const randCircles = (circleCount, minRadius, maxRadius) => {
    let circles = [];
    for(let i = 0; i < circleCount; i++) {
        circles.push({
            center: [randClip(), randClip()],
            color: randColor(),
            velocity: [0,0],
            radius: randRange(minRadius, maxRadius)
        });
    }

    return circleStruct.createFilledArray(circles);
}