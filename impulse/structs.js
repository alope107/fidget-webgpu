import { randRange } from "../shared/js/random.js";
import { randRGB } from "../shared/js/color.js";

// Want to recompute layouts?
// Go here! https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html

export const physStruct = (() => { 
    const code = /* wgsl */`
        struct Phys {
            invMass: f32, // 4 bytes
            restitution: f32, // 4 bytes
            velocity: vec2f, // 8 bytes
            center: vec2f, // 8 bytes
            halfDim: vec2f, // 8 bytes half width and height of bounding box
            color: vec3f, // 24 bytes, rgb w/o alpha
            overlaps: u32, // 4 bytes pseudobool, currently overlapping with anyone else?
        };  // total 48 bytes
    `
    const byteCount = 48;
    const floatCount = byteCount / 4;
    const createEmptyArray = (physCount) => {
        const data = new ArrayBuffer(byteCount * physCount);
        return {
            data,
            views: {
                invMassView: new Float32Array(data, 0),
                restitutionView: new Float32Array(data, 4),
                velocityView: new Float32Array(data, 8),
                centerView: new Float32Array(data, 16),
                halfDimView: new Float32Array(data, 24),
                colorView: new Float32Array(data, 32),
                overlapsView: new Uint32Array(data, 44)
            },
            count: physCount
        };
    };
    const createFilledArray = (physData) => {
        const data = createEmptyArray(physData.length);
        const {invMassView, restitutionView, velocityView, centerView, halfDimView, colorView} = data.views;
        physData.forEach(({invMass, restitution, velocity, center, halfDim, color}, i) => {
            invMassView.set([invMass], i*floatCount);
            restitutionView.set([restitution], i*floatCount);
            velocityView.set(velocity, i*floatCount);
            centerView.set(center, i*floatCount);
            halfDimView.set(halfDim, i*floatCount);
            colorView.set(color, i*floatCount)
            // start overlapping as 0
        });
        return data;
    };
    const create = ({mass, restitution, velocity, center, halfDim, color}) => new Float32Array(
        [mass !== 0 ? 1/mass : mass,
         restitution,
         ...velocity,
         ...center,
         ...halfDim,
         ...color,
         0, // overlapping
        ]
    );
    // areaFunction is how to compute the area of the physics objects given half dimensions
    // squareBB gives whether the bounding box should be a square or can be a rectangle
    const randPhys = ({count, minWidth, maxWidth, maxVelComp, density, restitution, invWorldScale}, areaFunc, squareBB=false) => {
        // TODO: better
        const wall = 1/invWorldScale;
        const objs = [];

        for(let i = 0; i < count; i++) {
            const center = [randRange(-wall, wall), randRange(-wall, wall)];

            const halfWidth = randRange(minWidth, maxWidth)/2;
            const halfDim = [halfWidth, squareBB ? halfWidth : randRange(minWidth, maxWidth)/2];

            const velocity = [randRange(-maxVelComp*wall, maxVelComp*wall), randRange(-maxVelComp*wall, maxVelComp*wall)];
            const color = randRGB();
            objs.push({
                invMass: 1 / (density * areaFunc(halfDim)),
                restitution,
                velocity,
                center,
                halfDim,
                color
            });
         }
        return objs;
    };
    const randJSRects = (opts) => randPhys(opts, ([halfWidth, halfHeight]) => halfWidth * halfHeight * 4);
    const randJSCircles = (opts) => randPhys(opts, ([halfWidth, halfHeight]) => Math.PI * halfWidth**2);
    return {
        code,
        byteCount,
        floatCount,
        create,
        createEmptyArray,
        createFilledArray,
        randJSRects,
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
            cameraMat: mat3x3f, // 48 bytes, camera transformation for scale/translate/rotate
            invCameraMat: mat3x3f, // 48 bytes, goes from camera space to world space
            invWorldScale: f32, // 4 bytes, scale for the overall game world
            // pad 12 bytes
        } // total 144 bytes
`;
    const byteCount = 144;
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
                cameraMatView: new Float32Array(data, 32),
                invCameraMatView: new Float32Array(data, 80),
                invWorldScaleView: new Float32Array(data, 128),
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
        createFilled: ({pointerLoc, pointerPressed, pointerHeld, gravity, wallCorner, cameraMat, invCameraMat, invWorldScale}) => {
            const uniform = createEmpty();
            uniform.views.pointerLocView.set(pointerLoc, 0);
            uniform.views.pointerPressedView.set([pointerPressed], 0);
            uniform.views.pointerHeldView.set([pointerHeld], 0);
            uniform.views.gravityView.set(gravity, 0);
            uniform.views.wallCornerView.set(wallCorner, 0);
            uniform.views.cameraMatView.set([...cameraMat[0], 0, // Adding mat3x3f internal padding
                                             ...cameraMat[1], 0,
                                             ...cameraMat[2], 0,
                                            ], 0);
            uniform.views.invCameraMatView.set([...invCameraMat[0], 0, // Adding mat3x3f internal padding
                                             ...invCameraMat[1], 0,
                                             ...invCameraMat[2], 0,
                                            ], 0);
            uniform.views.invWorldScaleView.set([invWorldScale], 0);
            return uniform;
        }
    };
})();