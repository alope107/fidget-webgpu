import buildCamera from "./camera.js";
import { computeShaderCode } from "./compute.js";
import { configFromQueryParams } from "./config.js";
import KeyChecker from "./keyboard.js";
import { renderShaderCode } from "./render.js";
import { startResizeObservation } from "./resize.js";
import { rectStruct, circleStruct, uniformsStruct } from "./structs.js";

const zoomInKey = 'e';
const zoomOutKey = 'q';
const leftKey = 'a';
const rightKey = 'd';
const upKey = 'w';
const downKey = 's';

let pointerLoc = [0, 0];
let pointerHeldNow = false;
let pointerHeldLastFrame = false;


let scale;
let trans = [0, 0];

const main = async () => {

    // TODO check for max supported first
    const device = await (await navigator.gpu?.requestAdapter( {
        powerPreference: "high-performance",
    }))?.requestDevice();

    if(!device) {        
        const errorMessage = document.body.appendChild(document.createElement("span"));
        errorMessage.innerText = "No WebGPU support :( "
        console.error("No WebGPU support :(");
        return;
    }

    const c = configFromQueryParams();
    scale = c.baseScale;

    const keys = new KeyChecker([
        zoomInKey,
        zoomOutKey,
        leftKey,
        rightKey,
        upKey,
        downKey
    ]);

    const renderTarget = document.body.appendChild(document.createElement("canvas"));
    renderTarget.id = "renderTarget";

    startResizeObservation(renderTarget,  device.limits.maxTextureDimension2D);

    // These errors are automatically surfaced in the chrome terminal,
    // but need to be explicitly listened for on webkit
    device.addEventListener("uncapturederror", (e) => {
        console.error("Uncaptured error: ", e.error.message);
    });

    const renderFormat = navigator.gpu.getPreferredCanvasFormat();
    const ctx = renderTarget.getContext("webgpu");
    ctx.configure( {
        device,
        format: renderFormat,
        alphaMode: "premultiplied"
    });

    const computeModule = device.createShaderModule({
        label: "computeShaderModule",
        code:computeShaderCode
    });
    const moveRectsPipeline = device.createComputePipeline({
        label: "moveRectsPipeline",
        layout: "auto",
        compute: {
            module: computeModule,
            entryPoint: "moveRects"
        }
    });
    const moveCirclesPipeline = device.createComputePipeline({
        label: "moveCirclesPipeline",
        layout: "auto",
        compute: {
            module: computeModule,
            entryPoint: "moveCircles"
        }
    });

    const renderModule = device.createShaderModule({
        label: "renderModule",
        code: renderShaderCode(c.polysPerCircle)
    });
    const rectRenderPipeline = device.createRenderPipeline({
        label: "rectRenderPipeline",
        layout: "auto",
        vertex: {
            entryPoint: "drawRect",
            module: renderModule
        },
        fragment:{
            entryPoint: "solidColor",
            module: renderModule,
            targets: [{format: renderFormat}]
        },
        primitive: {
            topology: "triangle-strip"
        }
    });
    // TODO: less copypasta
    const circleRenderPipeline = device.createRenderPipeline({
        label: "circleRenderPipeline",
        layout: "auto",
        vertex: {
            entryPoint: "drawCircle",
            module: renderModule
        },
        fragment:{
            entryPoint: "solidColor",
            module: renderModule,
            targets: [{format: renderFormat}]
        },
        primitive: {
            topology: "triangle-strip"
        }
    });
    const baseRenderPassDescriptor = {
        label: "baseRenderPassDescriptor",
        colorAttachments: [
            {
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    };
    const layeredRenderPassDescriptor = {
        label: "layeredRenderPassDescriptor",
        colorAttachments: [
            {
                loadOp: "load",
                storeOp: "store"
            }
        ]
    };

    const rects = rectStruct.createFilledArray(
        rectStruct.randomJSRects(c.rectCount, c.minRectWidth, c.maxRectWidth, c.maxRandVelComp, c.density, c.restitution)
    );

    const rectBufferConfig = {
        size: rects.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
               GPUBufferUsage.COPY_DST |
            //    GPUBufferUsage.COPY_SRC | // used for debugging
               GPUBufferUsage.VERTEX
    };
    // TODO: double buffer?
    const rectBufferPing = device.createBuffer({
        ...rectBufferConfig,
        label: "rectBufferPing",
    });
    const rectBufferPong = device.createBuffer({
        ...rectBufferConfig,
        label: "rectBufferPong",
    });
    
    device.queue.writeBuffer(rectBufferPing, 0, rects.data);
    device.queue.writeBuffer(rectBufferPong, 0, rects.data);

    const circles = circleStruct.createFilledArray(
        circleStruct.randJSCircles(c.circleCount, c.minCircleRadius, c.maxCircleRadius, c.maxRandVelComp, c.density, c.restitution)
    );

    const circleBufferConfig = {

        size: circles.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
               GPUBufferUsage.COPY_DST |
            //    GPUBufferUsage.COPY_SRC | // used for debugging
               GPUBufferUsage.VERTEX
    };
    // TODO: double buffer?
    const circleBufferPing = device.createBuffer( {
        ...circleBufferConfig,
        label: "circleBufferPing",
    });
    const circleBufferPong = device.createBuffer( {
        ...circleBufferConfig,
        label: "circleBufferPong",
    });
    device.queue.writeBuffer(circleBufferPing, 0, circles.data);
    device.queue.writeBuffer(circleBufferPong, 0, circles.data);


    const uniformBuffer = device.createBuffer({
        label: "uniformBuffer",
        size: uniformsStruct.byteCount,
        usage: GPUBufferUsage.UNIFORM | 
               GPUBufferUsage.COPY_DST 
    });

    // TODO: manually set layouts
    const moveRectsBindGroupPingToPong = device.createBindGroup({
        label: "moveRectsBindGroupPingToPong",
        layout: moveRectsPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: uniformBuffer},
            {binding: 1, resource: rectBufferPing},
            {binding: 2, resource: circleBufferPing},
            {binding: 3, resource: rectBufferPong},
            {binding: 4, resource: circleBufferPong},
        ]
    });
    const moveRectsBindGroupPongToPing = device.createBindGroup({
        label: "moveRectsBindGroupPongToPing",
        layout: moveRectsPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: uniformBuffer},
            {binding: 1, resource: rectBufferPong},
            {binding: 2, resource: circleBufferPong},
            {binding: 3, resource: rectBufferPing},
            {binding: 4, resource: circleBufferPing},
        ]
    });

    const renderRectsBindGroupPing = device.createBindGroup({
        label: "renderRectsBindGroupPing",
        layout: rectRenderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: rectBufferPing},
            {binding: 1, resource: circleBufferPing},
            {binding: 2, resource: uniformBuffer},
        ]
    });
    const renderRectsBindGroupPong = device.createBindGroup({
        label: "renderRectsBindGroupPong",
        layout: rectRenderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: rectBufferPong},
            {binding: 1, resource: circleBufferPong},
            {binding: 2, resource: uniformBuffer},
        ]
    });

    const moveCirclesBindGroupPingToPong = device.createBindGroup({
        label: "moveCirclesBindGroupPongtoPing",
        layout: moveCirclesPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: uniformBuffer},
            {binding: 1, resource: rectBufferPing},
            {binding: 2, resource: circleBufferPing},
            {binding: 3, resource: rectBufferPong},
            {binding: 4, resource: circleBufferPong},
        ]
    });
    const moveCirclesBindGroupPongToPing = device.createBindGroup({
        label: "moveCirclesBindGroupPongtoPing",
        layout: moveCirclesPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: uniformBuffer},
            {binding: 1, resource: rectBufferPong},
            {binding: 2, resource: circleBufferPong},
            {binding: 3, resource: rectBufferPing},
            {binding: 4, resource: circleBufferPing},
        ]
    });
    const renderCirclesBindGroupPing = device.createBindGroup({
        label: "renderCirclesBindGroupPing",
        layout: circleRenderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: rectBufferPing},
            {binding: 1, resource: circleBufferPing},
            {binding: 2, resource: uniformBuffer},
        ]
    });
    const renderCirclesBindGroupPong = device.createBindGroup({
        label: "renderCirclesBindGroupPong",
        layout: circleRenderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: rectBufferPong},
            {binding: 1, resource: circleBufferPong},
            {binding: 2, resource: uniformBuffer},
        ]
    });

    

    renderTarget.addEventListener("pointermove", () => {
        // Rescale to clip space, the scaling used by the compute/vertex shaders
        pointerLoc = [(2 * event.clientX / renderTarget.width) - 1, -((2 * event.clientY / renderTarget.height) - 1)];
    });
    renderTarget.addEventListener('pointerdown', () => { pointerHeldNow = 1; });
    renderTarget.addEventListener('pointerup', () => { pointerHeldNow = 0; });
    renderTarget.addEventListener('pointeleave', () => { pointerHeldNow = 0; });
    renderTarget.addEventListener('pointercancel', () => { pointerHeldNow = 0; });


    let frameCount = 0;
    let pingToPong = true;
    const render = async() => {
        const encoder = device.createCommandEncoder({label: "encoder"});

        let moveRectsPass = encoder.beginComputePass();
        moveRectsPass.setPipeline(moveRectsPipeline);
        moveRectsPass.setBindGroup(0, pingToPong ? moveRectsBindGroupPingToPong : moveRectsBindGroupPongToPing);
        moveRectsPass.dispatchWorkgroups(Math.ceil(rects.count/64), Math.ceil(rects.count/64), 1);
        moveRectsPass.end();

        let moveCirclesPass = encoder.beginComputePass();
        moveCirclesPass.setPipeline(moveCirclesPipeline);
        moveCirclesPass.setBindGroup(0, pingToPong ? moveCirclesBindGroupPingToPong : moveCirclesBindGroupPongToPing);
        moveCirclesPass.dispatchWorkgroups(Math.ceil(circles.count/64), Math.ceil(circles.count/64), 1);
        moveCirclesPass.end();

        moveCirclesPass = encoder.beginComputePass();
        moveCirclesPass.setPipeline(moveCirclesPipeline);
        moveCirclesPass.setBindGroup(0, pingToPong ? moveCirclesBindGroupPongToPing : moveCirclesBindGroupPingToPong);
        moveCirclesPass.dispatchWorkgroups(Math.ceil(circles.count/64), Math.ceil(circles.count/64), 1);
        moveCirclesPass.end();

        moveCirclesPass = encoder.beginComputePass();
        moveCirclesPass.setPipeline(moveCirclesPipeline);
        moveCirclesPass.setBindGroup(0, pingToPong ? moveCirclesBindGroupPingToPong : moveCirclesBindGroupPongToPing);
        moveCirclesPass.dispatchWorkgroups(Math.ceil(circles.count/64), Math.ceil(circles.count/64), 1);
        moveCirclesPass.end();

        baseRenderPassDescriptor.colorAttachments[0].view = ctx.getCurrentTexture().createView();
        const rectRenderPass = encoder.beginRenderPass(baseRenderPassDescriptor);
        rectRenderPass.setPipeline(rectRenderPipeline);
        rectRenderPass.setBindGroup(0, pingToPong ? renderRectsBindGroupPong : renderRectsBindGroupPong);
        rectRenderPass.draw(4, rects.count); // Rectangle needs 4 vertices
        rectRenderPass.end();

        layeredRenderPassDescriptor.colorAttachments[0].view = ctx.getCurrentTexture().createView();
        const circleRenderPass = encoder.beginRenderPass(layeredRenderPassDescriptor);
        circleRenderPass.setPipeline(circleRenderPipeline);
        circleRenderPass.setBindGroup(0, pingToPong ? renderCirclesBindGroupPong : renderCirclesBindGroupPing);
        circleRenderPass.draw(c.polysPerCircle*2 + 1, circles.count); 
        circleRenderPass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        frameCount++;
        pingToPong = !pingToPong;
    };

    const animationFrame = async (timestamp) => {
        // TODO: move magic # to config
        if(keys.get(zoomInKey).held) scale *= 1.1;
        if(keys.get(zoomOutKey).held) scale *= .9;
        // TODO: Move magic # to config and maybe scale it with scale?
        const transSpeed = 10;
        if(keys.get(leftKey).held) trans[0] += transSpeed;
        if(keys.get(rightKey).held) trans[0] -= transSpeed;
        if(keys.get(upKey).held) trans[1] -= transSpeed;
        if(keys.get(downKey).held) trans[1] += transSpeed;

        const camera = buildCamera(trans, [scale, scale]);
        const uniform = uniformsStruct.createFilled({
            pointerLoc: pointerLoc,
            pointerHeld: pointerHeldNow,
            pointerPressed: !pointerHeldLastFrame && pointerHeldNow,
            gravity: [c.gravX, c.gravY],
            wallCorner: [1000, -1000], // NOT YET USED, TODO
            cameraMat: camera
        });
        pointerHeldLastFrame = pointerHeldNow;
        keys.tick();
        device.queue.writeBuffer(uniformBuffer, 0, uniform.data);
        render();
        requestAnimationFrame(animationFrame);
    };
    requestAnimationFrame(animationFrame);
};

main();