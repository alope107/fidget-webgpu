import { edgeStruct, nodeStruct, triangleStruct, uniformsStruct } from "./structs.js";
import { global_invocation_index } from "./linear_indexing.js";
import { barycentric, intersection } from "./vectors.js";

export const computeShaderCode = /* wgsl */ `
${global_invocation_index}

${nodeStruct().code}
${edgeStruct().code}
${triangleStruct().code}
${uniformsStruct}

${barycentric}
${intersection}


@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read_write> nodes : array<Node>;
@group(0) @binding(2) var<storage, read_write> edges : array<Edge>; 
@group(0) @binding(3) var<storage, read_write> triangles : array<Triangle>;

// DEBUG - count how times each id is hit
// @group(0) @binding(4) var<storage, read_write> counts : array<atomic<u32>>;



// TODO: better workgroup size UPDATE THE GLOBAL INDEX CALC IF CHANGED
@compute @workgroup_size(8, 8, 1) fn applyPhysics(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>) {
        let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                         8*8*1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);

        if(id >= arrayLength(&nodes)) {return;}

        // DEBUG
        // Counting how mnay invocations per id - worried things might be double/undercounted?
        // atomicAdd(&counts[id], 1);

        let restitution = .2;
        let damping = .999;
        nodes[id].overlapping = 0;

        // WILDLY INEFFICIENT
        for(var i = 0u; i < arrayLength(&edges); i++) {
            let edge = edges[i];
            // todo: forces pass then velocities pass to avoid double checking
            if(edge.nodes[0] == id || edge.nodes[1] == id) {
                // TODO: select
                var otherId : u32;
                if(edge.nodes[0] == id) { otherId = edge.nodes[1]; }
                if(edge.nodes[1] == id) { otherId = edge.nodes[0]; }

                let delta = nodes[otherId].position - nodes[id].position;
                let currentLength = length(delta);
                let currentForce = (edge.idealLength - currentLength) * -edge.k;
                nodes[id].velocity += delta * (currentForce / currentLength);

                // EVEN MORE WILDLY INEFFICIENT
                // ALSO WRONG
                for(var j = 0u; j < arrayLength(&edges); j++) {
                    if(j == i) {continue;}
                    let otherEdge = edges[j];
                    if(otherEdge.nodes[0] != id && otherEdge.nodes[1] != id &&
                       otherEdge.nodes[0] != otherId && otherEdge.nodes[1] != otherId) {
                        if(intersection(nodes[id].position, nodes[otherId].position,
                                        nodes[otherEdge.nodes[0]].position, nodes[otherEdge.nodes[1]].position).z != 0) {
                                            nodes[id].overlapping = 1;
                                        }
                    }
                }

            
            }
        }

        nodes[id].velocity += uniforms.gravity;
        nodes[id].velocity *= damping;
        nodes[id].position += nodes[id].velocity;

        // TODO: other walls?
        // TODO: branchless?
        if(nodes[id].position.y < -1) {
            nodes[id].position.y = -1;
            nodes[id].velocity.y *= -1 * restitution;
        }
        if(nodes[id].position.y > 1) {
            nodes[id].position.y = 1;
            nodes[id].velocity.y *= -1 * restitution;
        }
        if(nodes[id].position.x < -1) {
            nodes[id].position.x = -1;
            nodes[id].velocity.x *= -1 * restitution;
        }
        if(nodes[id].position.x > 1) {
            nodes[id].position.x = 1;
            nodes[id].velocity.x *= -1 * restitution;
        }

        _ = triangles[0].vertices[0];
        // INEFFICIENT and INCORRECT collision checking
        // Star of David overlaps not caught :(
        // for(var i = 0u; i < arrayLength(&triangles); i++) {
        //     let triangle = triangles[i];
        //     let t1 = nodes[triangle.vertices[0]].position;
        //     let t2 = nodes[triangle.vertices[0]].position;
        //     let t3 = nodes[triangle.vertices[0]].position;
        //     if(triangle.vertices[0] != id &&
        //        triangle.vertices[1] != id &&
        //        triangle.vertices[2] != id &&
        //        pointInTri(nodes[id].position,
        //                   nodes[triangle.vertices[0]].position,
        //                   nodes[triangle.vertices[1]].position,
        //                   nodes[triangle.vertices[2]].position)) {
        //             nodes[id].overlapping = 1;
        //         }
        // }
    }
`;