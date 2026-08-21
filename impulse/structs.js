import { randClip, randRange } from "./random.js";
import { randSolidColor } from "./color.js";

// Want to recompute layouts?
// Go here! https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html

export const physStruct = (() => { 
    const code = /* wgsl */`
        struct Phys {
            invMass: f32, // 4 bytes
            restitution: f32, // 4 bytes
            velocity: vec2f, // 8 bytes
        }  // total 16 bytes
    `
    const byteCount = 16;
    const floatCount = byteCount / 4;
    const createEmptyArray = (physCount) => {
        const data = new ArrayBuffer(byteCount * physCount);
        return {
            data,
            views: {
                invMassView: new Float32Array(data, 0),
                restitutionView: new Float32Array(data, 4),
                velocityView: new Float32Array(data, 8)
            },
            count: physCount
        };
    };
    const createFilledArray = (physData) => {
        const data = createEmptyArray(physData.length);
        const {invMassView, restitutionView, velocityView} = data.views;
        physData.forEach(({invMass, restitution, velocity}, i) => {
            invMassView.set([invMass], i*floatCount);
            restitutionView.set([restitution], i*floatCount);
            velocityView.set(velocity, i*floatCount);
        });
        return data;
    };
    const create = ({mass, restitution, velocity}) => new Float32Array(
        [mass !== 0 ? 1/mass : mass,
         restitution,
         velocity[0],
         velocity[1]
        ]
    );
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray,
        create
    };
})();

export const rectStruct = (() => { 
    const code = /* wgsl */`
        struct Rect {
            topLeft: vec2f, // 8 bytes
            bottomRight: vec2f, // 8 bytes
            phys: Phys, // 16 bytes
            overlaps: u32, // 4 bytes
            // pad 4 bytes
        }  // total 40 bytes
    `
    const byteCount = 40;
    const floatCount = byteCount / 4;
    const uint32Count = byteCount / 4;
    const createEmptyArray = (rectCount) => {
        const data = new ArrayBuffer(byteCount * rectCount);
        return {
            data,
            views: {
                topLeftView: new Float32Array(data, 0),
                bottomRightView: new Float32Array(data, 8),
                physView: new Float32Array(data, 16), // Float32 makes sens for now... but what if phys had both f32 and u32????
                overlapsView: new Uint32Array(data, 32),
            },
            count: rectCount
        };
    };
    const createFilledArray = (rectData) => {
        const data = createEmptyArray(rectData.length);
        const {topLeftView, bottomRightView, physView} = data.views;
        rectData.forEach(({topLeft, bottomRight, velocity, phys}, i) => {
            topLeftView.set(topLeft, i*floatCount);
            bottomRightView.set(bottomRight, i*floatCount);
            physView.set(phys, i*floatCount)
            // overlaps set to 0
            // pad set to 0
        });
        return data;
    };
    // Eventually move to random density / restitution
    const randomJSRects = (count, minWidth, maxWidth, maxVelComp, density, restitution) => {
        const rects = [];
        for(let i = 0; i < count; i++) {
            const topLeft = [randClip(), randClip()];
            const w = randRange(minWidth, maxWidth), h = randRange(minWidth, maxWidth);
            const velocity = [randRange(-maxVelComp, maxVelComp), randRange(-maxVelComp, maxVelComp)];
            rects.push({
                topLeft,
                bottomRight: [Math.min(topLeft[0] + w, 1), Math.min(topLeft[1] + h, 1)],
                phys: physStruct.create({
                    mass: density*w*h,
                    restitution,
                    velocity
                })
           });
         }
        return rects;
    };
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray,
        randomJSRects
    };
})();

export const circleStruct = (() => { 
    const code = /* wgsl */`
        struct Circle {
            color: vec4f, // 16 bytes
            center: vec2f, // 8 bytes
            radius: f32, // 4 bytes
            overlaps: u32, // 4 bytes
            phys: Phys // 16 bytes
        }  // total 48 bytes
    `
    const byteCount = 48;
    const floatCount = byteCount / 4;
    const uint32Count = byteCount / 4;
    const createEmptyArray = (circleCount) => {
        const data = new ArrayBuffer(byteCount * circleCount);
        return {
            data,
            views: {
                colorView: new Float32Array(data, 0),
                centerView: new Float32Array(data, 16),
                radiusView: new Float32Array(data, 24),
                overlapsView: new Uint32Array(data, 28),
                physView: new Float32Array(data, 32)
            },
            count: circleCount
        };
    };
    const createFilledArray = (circleData) => {
        const data = createEmptyArray(circleData.length);
        const {colorView, centerView, radiusView, physView} = data.views;
        circleData.forEach(({color, center, radius, phys}, i) => {
            colorView.set(color, i*floatCount);
            centerView.set(center, i*floatCount);
            radiusView.set([radius], i*floatCount);
            // overlaps set to 0s
            physView.set(phys, i*floatCount);
            
        });
        return data;
    };
    // Eventually move to random density/restitution
    const randJSCircles =  (circleCount, minRadius, maxRadius, maxVelComp,  density, restitution) => {
        let circles = [];
        const scale = .001;
        const wall = 1/scale;
        for(let i = 0; i < circleCount; i++) {
            const velocity = [randRange(-maxVelComp*wall, maxVelComp*wall), randRange(-maxVelComp*wall, maxVelComp*wall)];
            const radius = randRange(minRadius, maxRadius);

            circles.push({
                center: [randRange(-wall, wall), randRange(-wall, wall)],//[randClip(), randClip()],
                color: randSolidColor(),
                radius,
                phys: physStruct.create({
                    restitution,
                    mass: Math.PI * radius**2 * density,
                    velocity
                })
            });
        }
        return circles;
    }
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray,
        randJSCircles
    };
})();


export const uniformsStruct = (() => { 
    const code = /* wgsl */ `
        struct Uniforms {
            pointerLoc: vec2f, // 8 bytes, location of pointer
            pointerPressed: u32, // 4 bytes, was the pointer first pressed this frame?
            pointerHeld: u32, // 4 bytes, is the pointer currently held down?
            gravity: vec2f, // 8 bytes, gravity vector
            wallCorner: vec2f, // 8 bytes, bottom right corner of the square the dots are bound to TODO: Think about 0 origin vs 0 top left
            cameraMat: mat3x3f // 48 bytes camera transformation for scale/translate/rotate
        } // total 80 bytes
`;
    const byteCount = 80;
    const u32Count = byteCount/4;
    const floatCount = byteCount/4;
    const createEmpty = () => {
        const data = new ArrayBuffer(byteCount);
        return {
            data,
            views: {
                pointerLocView: new Float32Array(data, 0),
                pointerPressedView: new Uint32Array(data, 8),
                pointerHeldView: new Uint32Array(data, 12),
                gravityView: new Float32Array(data, 16),
                wallCornerView: new Float32Array(data, 24),
                cameraMatView: new Float32Array(data, 32)
            },
            count: 1
        };
    };
    return {
        code,
        byteCount,
        u32Count,
        floatCount,
        createEmpty,
        createFilled: ({pointerLoc, pointerPressed, pointerHeld, gravity, wallCorner, cameraMat}) => {
            const uniform = createEmpty();
            uniform.views.pointerLocView.set(pointerLoc, 0);
            uniform.views.pointerPressedView.set([pointerPressed], 0);
            uniform.views.pointerHeldView.set([pointerHeld], 0);
            uniform.views.gravityView.set(gravity, 0);
            uniform.views.wallCornerView.set(wallCorner, 0);
            uniform.views.cameraMatView.set([...cameraMat[0], 0, // Adding mat3x3f internal padding
                                             ...cameraMat[1], 0,
                                             ...cameraMat[2], 0,
                                            ], 

                0); 
            return uniform;
        }
    };
})();