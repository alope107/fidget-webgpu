import { rectStruct, circleStruct, uniformsStruct, physStruct } from "./structs.js";
import { unitCirclePointsWGSL } from "./geometry.js";

export const renderShaderCode = (polysPerCircle) => /* wgsl */ `
${physStruct.code}
${rectStruct.code}
${circleStruct.code}
${uniformsStruct.code}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
}

@group(0) @binding(0) var<storage, read> rects : array<Rect>;
@group(0) @binding(1) var<storage, read> circles : array<Circle>; 
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

@vertex fn drawRect(@builtin(vertex_index) vertexIdx : u32, 
                    @builtin(instance_index) instanceIdx : u32) -> VertexOutput {
    _ = circles[0].radius;
    _ = uniforms.pointerHeld;
    let rect = rects[instanceIdx];
    let points = array(
        rect.topLeft,
        vec2f(rect.topLeft.x, rect.bottomRight.y),
        vec2f(rect.bottomRight.x, rect.topLeft.y),
        rect.bottomRight
    );
    return VertexOutput(
        vec4f(points[vertexIdx], 1, 1),
        select(vec4f(1, 1, 0, 1), vec4f(1, 0, 0, 1), rect.overlaps > 0)
    );
}

const UNIT_CIRCLE_POINTS = ${unitCirclePointsWGSL(polysPerCircle)}

@vertex fn drawCircle(@builtin(vertex_index) vertexIdx : u32, 
                    @builtin(instance_index) instanceIdx : u32) -> VertexOutput {
    let scale = 0.001;
    _ = rects[0].topLeft;
    let circle = circles[instanceIdx];
    let r = select(0., circle.radius, (vertexIdx & 1) == 0); // Alternate between edges and center

    let offset = r * UNIT_CIRCLE_POINTS[vertexIdx/2];

    let baseColor = select(vec4(), circle.color, (vertexIdx & 1) == 0);

    let transformedPosition =  uniforms.cameraMat * vec3(circle.center+offset, 1);

    return VertexOutput(
        vec4f(transformedPosition, 1.),
        //vec4f((circle.center + offset)* scale, 0, 1.),
        select(baseColor, vec4f(1, 0, 0, 1), circle.overlaps > 0)
    );
}

@fragment fn solidColor(fragInput : VertexOutput) -> @location(0) vec4f {
    // Precomputed alpha blending (would technically be better to pre-do in struct)
    return vec4f(fragInput.color.rgb*fragInput.color.a, fragInput.color.a);
}
`;