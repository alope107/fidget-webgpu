import { dotStruct } from "./structs.js";

export const renderShaderCode = /* wgsl */ `
${ dotStruct.code}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
}

@group(0) @binding(0) var<storage, read> dots : array<Dot>; 

@vertex fn drawDots(@builtin(vertex_index) vertexIdx : u32, 
                    @builtin(instance_index) instanceIdx : u32) -> VertexOutput {
    let dot = dots[instanceIdx];
    return VertexOutput(
        vec4f(dot.position, 1, 1),
        dot.color
    );
}

@fragment fn solidColor(fragInput : VertexOutput) -> @location(0) vec4f {
    return vec4f(fragInput.color.rgb*fragInput.color.a, fragInput.color.a);
    // return fragInput.color;
}
`;