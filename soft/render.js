import { triangleStruct, nodeStruct } from "./structs.js";

export const renderShaderCode = /* wgsl */ `
${triangleStruct().code}
${nodeStruct().code}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f
}

@group(0) @binding(0) var<storage, read> nodes : array<Node>; 
@group(0) @binding(1) var<storage, read> triangles : array<Triangle>;


@vertex fn triangle(
    @builtin(vertex_index) vertexIdx : u32,
    @builtin(instance_index) triangleIdx: u32) -> VertexOutput {
        let triangle = triangles[triangleIdx];
        let nodeId = triangle.vertices[vertexIdx];
        return VertexOutput(
            vec4(nodes[nodeId].position, 0, 1),
            select(vec4f(1., 0., 0., 1.), triangle.color, nodes[nodeId].overlapping == 0) // turn red if overlapping
        );
}

@fragment fn solidColor(fragInput : VertexOutput) -> @location(0) vec4f {
    return fragInput.color;
}
`;