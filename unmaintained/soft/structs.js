// Want to recompute layouts?
// Go here! https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html
export const triangleStruct = () => { 
    const code = /* wgsl */`
        struct Triangle {
            color: vec4f, // 16 bytes
            vertices: array<u32, 3>, // 12 bytes // holds node idxs
            // pad  4 bytes
        } // total 32 bytes
    `
    const byteCount = 32;
    const floatCount = byteCount / 4;
    const u32Count = byteCount / 4;
    const createEmptyArray = (triangleCount) => {
        const data = new ArrayBuffer(byteCount * triangleCount);
        return {
            data,
            views: {
                colorView: new Float32Array(data, 0),
                vertexView: new Uint32Array(data, 16),
            },
            count: triangleCount
        };
    };
    const createFilledArray = (triangleData) => {
        const data = createEmptyArray(triangleData.length);
        const {colorView, vertexView} = data.views;
        triangleData.forEach(({color, vertices}, i) => {
            colorView.set(color, i*floatCount);
            vertexView.set(vertices, i*u32Count);
        });
        return data;
    };
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray
    };
};

export const nodeStruct = () => { 
    const code = /* wgsl */`
        struct Node {
            position: vec2f, // 8 bytes
            velocity: vec2f,  // 8 bytes
            overlapping: u32 // 4 bytes // this is really just a bool right now, so it's overkill. Merge with others later?
            // pad 4 bytes
        } // total: 24 bytes
    `
    const byteCount = 24;
    const floatCount = byteCount / 4;
    const createEmptyArray = (nodeCount) => {
        const data = new ArrayBuffer(byteCount * nodeCount);
        return {
            data,
            views: {
                positionView: new Float32Array(data, 0),
                velocityView: new Float32Array(data, 8),
                overlappingView: new Uint32Array(data, 16),
            },
            count: nodeCount
        };
    };
    const createFilledArray = (nodeData) => {
        const data = createEmptyArray(nodeData.length);
        // for now overlapping will always default to 0
        const {positionView, velocityView} = data.views;
        nodeData.forEach(({position, velocity}, i) => {
            positionView.set(position, i*floatCount);
            velocityView.set(velocity, i*floatCount);
        });
        return data;
    };
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray
    };
};

export const edgeStruct = () => { 
    const code = /* wgsl */`
        struct Edge {
            nodes: vec2u, // 8 bytes // ids of nodes
            idealLength: f32, // 4 bytes
            k: f32 // 4 bytes
        } // 16 byts
    `
    const byteCount = 16;
    const floatCount = byteCount / 4;
    const u32Count = byteCount / 4;
    const createEmptyArray = (edgeCount) => {
        const data = new ArrayBuffer(byteCount * edgeCount);
        return {
            data,
            views: {
                nodesView: new Uint32Array(data, 0),
                idealLengthView: new Float32Array(data, 8),
                kView: new Float32Array(data, 12)
            },
            count: edgeCount
        };
    };
    const createFilledArray = (edgeData) => {
        const data = createEmptyArray(edgeData.length);
        const {nodesView, idealLengthView, kView} = data.views;
        edgeData.forEach(({nodes, idealLength, k}, i) => {
            nodesView.set(nodes, i*u32Count);
            idealLengthView.set([idealLength], i*floatCount);
            kView.set([k], i*floatCount);
        });
        return data;
    };
    return {
        code,
        byteCount,
        floatCount,
        createEmptyArray,
        createFilledArray
    };
};

export const uniformsStruct = /* wgsl */ `
struct Uniforms {
    gravity: vec2f //8 bytes
} // total 8 bytes
`;