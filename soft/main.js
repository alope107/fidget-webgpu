import { computeShaderCode } from "./compute.js";
import { renderShaderCode } from "./render.js";
import { startResizeObservation } from "./resize.js";
import { edgeStruct, nodeStruct, triangleStruct } from "./structs.js";
import { randClip, randTriangles, randRange } from "./random.js";
import { dist } from "./vectors.js";

let accel = {x: 0, y:-9.8, z:0};

const DEBUG = false;
const DEBUG_INTERVAL = 10;
const DEBUG_CUTOFF = 1000;

const TRIANGLE_COUNT = 10;

const main = async () => {
    const device = await (await navigator.gpu?.requestAdapter( {
        powerPreference: "high-performance",
    }))?.requestDevice();

    let renderTarget;
    if(device) {        
        renderTarget = document.body.appendChild(document.createElement("canvas"));
        renderTarget.id = "renderTarget";
    } else {
        let errorMessage = document.body.appendChild(document.createElement("span"));
        errorMessage.innerText = "No WebGPU support :( "
        console.error("No WebGPU support :(");
        return;
    }

    // These errors are automatically surfaced in the chrome terminal,
    // but need to be explicitly listened for on webkit
    device.addEventListener("uncapturederror", (e) => {
        console.error("Uncaptured error: ", e.error.message);
    });

    startResizeObservation(renderTarget, device.limits.maxTextureDimension2D);

    const renderFormat = navigator.gpu.getPreferredCanvasFormat();
    const ctx = renderTarget.getContext("webgpu");
    ctx.configure( {
        device,
        format: renderFormat
    });

    const computeModule = device.createShaderModule({
        label: "compute shader module",
        code:computeShaderCode
    })
    const physicsPipeline = device.createComputePipeline({
        label: "physics pipeline",
        layout: "auto",
        compute: {
            module: computeModule,
            entryPoint: "applyPhysics"
        }
    });

    const renderModule = device.createShaderModule({
        label: "render module",
        code: renderShaderCode
    });
    const renderPipeline = device.createRenderPipeline({
        label: "render pipeline",
        layout: "auto",
        vertex: {
            entryPoint: "triangle",
            module: renderModule
        },
        fragment:{
            entryPoint: "solidColor",
            module: renderModule,
            targets: [{format: renderFormat}]
        }
    });
    const renderPassDescriptor = {
        label: "render pass descriptor",
        colorAttachments: [
            {
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    };

    const jsStructData = randTriangles(TRIANGLE_COUNT, .2);
    const nodes = nodeStruct().createFilledArray(jsStructData.nodes);
    const edges = edgeStruct().createFilledArray(jsStructData.edges);
    const triangles = triangleStruct().createFilledArray(jsStructData.triangles);


    const nodeBuffer = device.createBuffer({
        label: "nodeBuffer",
        size: nodes.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
               GPUBufferUsage.COPY_DST |
               GPUBufferUsage.COPY_SRC | // used for debugging
               GPUBufferUsage.VERTEX
    });
    const edgeBuffer = device.createBuffer({
        label: "edgeBuffer",
        size: edges.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
              GPUBufferUsage.COPY_SRC | // used for debugging
               GPUBufferUsage.COPY_DST 
    });
    const triangleBuffer = device.createBuffer({
        label: "triangleBuffer",
        size: triangles.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
               GPUBufferUsage.COPY_DST |
               GPUBufferUsage.VERTEX
    });

    const uniformFloatCount = 2;
    const uniformData = new Float32Array(uniformFloatCount);

    const uniformBuffer = device.createBuffer({
        label: "uniform buffer",
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | 
               GPUBufferUsage.COPY_DST 
    });

    const physicsBindGroup = device.createBindGroup({
        label: "physicsBindGroup",
        layout: physicsPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: uniformBuffer},
            {binding: 1, resource: nodeBuffer},
            {binding: 2, resource: edgeBuffer},
            {binding: 3, resource: triangleBuffer}
        ]
    });
    const renderBindGroup = device.createBindGroup({
        label: "renderBindGroup",
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: nodeBuffer},
            {binding: 1, resource: triangleBuffer}
        ]
    });

    let debugNodeBuffer;
    let debugEdgeBuffer;
    if(DEBUG) {
        debugNodeBuffer = device.createBuffer({
            label: "debugNodeBuffer",
            size: nodes.data.byteLength,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
        debugEdgeBuffer = device.createBuffer({
            label: "debugEdgeBuffer",
            size: edges.data.byteLength,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
    }

    device.queue.writeBuffer(nodeBuffer, 0, nodes.data);
    device.queue.writeBuffer(edgeBuffer, 0, edges.data);
    device.queue.writeBuffer(triangleBuffer, 0, triangles.data);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const render = () => {
        

        const encoder = device.createCommandEncoder({label: "encoder"});
        
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(physicsPipeline);
        computePass.setBindGroup(0, physicsBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(Math.max(64, nodes.count/64)), Math.ceil(Math.max(64, nodes.count/64)));
        computePass.end();
        
        renderPassDescriptor.colorAttachments[0].view = ctx.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass(renderPassDescriptor);
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        renderPass.draw(3, triangles.count);
        renderPass.end();

        if(DEBUG) {
            encoder.copyBufferToBuffer(nodeBuffer, 0, debugNodeBuffer, 0, nodeBuffer.size);
            encoder.copyBufferToBuffer(edgeBuffer, 0, debugEdgeBuffer, 0, edgeBuffer.size);
        }

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    };

    let fc = 0;
    const animationFrame = async (timestamp) => {
        const factor = 40000;
        uniformData[0] = accel.x/factor;
        uniformData[1] = accel.y/factor;
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        if(DEBUG && fc%DEBUG_INTERVAL == 0) {
            await debugNodeBuffer.mapAsync(GPUMapMode.READ);
            const result = Array.from(new Float32Array(debugNodeBuffer.getMappedRange()));
            //console.log(result);
            debugNodeBuffer.unmap();
            await debugEdgeBuffer.mapAsync(GPUMapMode.READ);
            console.log(Array.from(new Uint32Array(debugEdgeBuffer.getMappedRange())));
            debugEdgeBuffer.unmap();
            if(fc >= DEBUG_CUTOFF) {return;}
        }

        render();
        requestAnimationFrame(animationFrame);
    };
    requestAnimationFrame(animationFrame);
};

const initializeAccelerometer = async (e) => {
    document.getElementById("prompt").remove();
    window.addEventListener("devicemotion", (event) => {
        let accelInclG = event.accelerationIncludingGravity;
        if(accelInclG.x != null) {
            accel.x = accelInclG.x*-1;
            accel.y = accelInclG.y*-1;
            accel.z = accelInclG.z;
        }
    });
    main();
}

// Only need user input if on mobile so accelerometer can be accessed
// Otherwise just start immedately on desktop
if(!window.matchMedia('(hover: hover)').matches && window.matchMedia('(pointer: coarse)').matches) {
    let userPrompt = document.body.appendChild(document.createElement("h1"));
    userPrompt.innerText = "Press me";
    userPrompt.id="prompt";
    userPrompt.addEventListener("pointerup", initializeAccelerometer);
} else {
    main();
}

