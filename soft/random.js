import { dist } from "./vectors.js";

export const randRange =  (min, max) => Math.random() * (max-min) + min; // random in range
export const randClip = () => randRange(-1, 1); // random inside clip bound
export const randColor = () => [Math.random(), Math.random(), Math.random(), 1.];
export const randTriangles = (count, k) => {

    const nodes = [];
    const edges = [];
    const triangles = [];
    for(let i = 0; i < count; i++) {
        const center = [randClip(), randClip()];
        let baseIdx = nodes.length;
        let nodeIdxs = [baseIdx, baseIdx+1, baseIdx+2];
        for(let j = 0; j < 3; j++) {
            nodes.push(
                {
                    position: [center[0]+randRange(-.2, .2), center[1]+randRange(-.2, .2)],
                    velocity: [0, 0],
                }
            );
        }
        edges.push({
            k,
            nodes: [nodeIdxs[0], nodeIdxs[1]],
            idealLength: dist(nodes[nodeIdxs[0]].position, nodes[nodeIdxs[1]].position)
        });
        edges.push({
            k,
            nodes: [nodeIdxs[0], nodeIdxs[2]],
            idealLength: dist(nodes[nodeIdxs[0]].position, nodes[nodeIdxs[2]].position)
        });
        edges.push({
            k,
            nodes: [nodeIdxs[1], nodeIdxs[2]],
            idealLength: dist(nodes[nodeIdxs[1]].position, nodes[nodeIdxs[2]].position)
        });
        triangles.push({
            color: randColor(),
            vertices: nodeIdxs
        });
    };
    return {nodes, edges, triangles};
};