import { computeShaderCode } from "./compute.js";
import { configFromQueryParams } from "./config.js";
import { randClip, randDots } from "./random.js";
import { extractPixels } from "./raster.js";
import { renderShaderCode } from "./render.js";
import { startResizeObservation } from "./resize.js";
import { dotStruct, uniformsStruct } from "./structs.js";

let pointerLoc = [0, 0];
let pointerHeldNow = false;
let pointerHeldLastFrame = false;

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

    const config = configFromQueryParams();

    const renderTarget = document.body.appendChild(document.createElement("canvas"));
    renderTarget.id = "renderTarget";

    const {promise : rasterizerPromise, resolve : rasterizerResolver} = Promise.withResolvers();

    startResizeObservation(renderTarget, rasterizerResolver, device.limits.maxTextureDimension2D);

    const fontRasterizer = await rasterizerPromise;
    const fontCtx = fontRasterizer.getContext("2d");
    fontCtx.font = `${config.size} ${config.font}`;
    fontCtx.fillStyle = config.color;
    fontCtx.fillText(config.text, 30, 300);

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
        label: "compute shader module",
        code:computeShaderCode
    });
    const moveDotsPipeline = device.createComputePipeline({
        label: "moveDots pipeline",
        layout: "auto",
        compute: {
            module: computeModule,
            entryPoint: "moveDots"
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
            entryPoint: "drawDots",
            module: renderModule
        },
        fragment:{
            entryPoint: "solidColor",
            module: renderModule,
            targets: [{format: renderFormat}]
        },
        primitive: {
            topology: "point-list"
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

    const dots = dotStruct.createFilledArray(extractPixels(fontRasterizer, [1, 1, 1, 1]).map(
        (d) => {
            return {...d, velocity: [0, 0]}
        }
    ));


    // TODO: double buffer -performance gain - cannot update buffer while rendering
    const dotBuffer = device.createBuffer({
        label: "dotBuffer",
        size: dots.data.byteLength,
        usage: GPUBufferUsage.STORAGE |
               GPUBufferUsage.COPY_DST |
            //    GPUBufferUsage.COPY_SRC | // used for debugging
               GPUBufferUsage.VERTEX
    });


    let uniform = uniformsStruct.createFilled({
        pointerLoc: [0, 0],
        pointerHeld: 0,
        pointerPressed: 0
    });
    const uniformBuffer = device.createBuffer({
        label: "uniform buffer",
        size: uniform.data.byteLength,
        usage: GPUBufferUsage.UNIFORM | 
               GPUBufferUsage.COPY_DST 
    });

    const computeBindGroup = device.createBindGroup({
        label: "computeBindGroup",
        layout: moveDotsPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: dotBuffer},
            {binding: 1, resource: uniformBuffer},
        ]
    });

    const renderBindGroup = device.createBindGroup({
        label: "renderBindGroup",
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: dotBuffer},
        ]
    });

    // kept for reference
    device.queue.writeBuffer(dotBuffer, 0, dots.data);

    renderTarget.addEventListener("pointermove", () => {
        // Rescale to clip space, the scaling used by the compute/vertex shaders
        pointerLoc = [(2 * event.clientX / renderTarget.width) - 1, -((2 * event.clientY / renderTarget.height) - 1)];
    });
    renderTarget.addEventListener('pointerdown', () => { pointerHeldNow = 1; });
    renderTarget.addEventListener('pointerup', () => { pointerHeldNow = 0; });
    renderTarget.addEventListener('pointeleave', () => { pointerHeldNow = 0; });
    renderTarget.addEventListener('pointercancel', () => { pointerHeldNow = 0; });


    let frameCount = 0;
    const render = async() => {
        const encoder = device.createCommandEncoder({label: "encoder"});

        //Optimize with render bundles???
        //
        let computePass = encoder.beginComputePass();
        computePass.setPipeline(moveDotsPipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(dots.count/64), Math.ceil(dots.count/64), 1);
        computePass.end();

        renderPassDescriptor.colorAttachments[0].view = ctx.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass(renderPassDescriptor);
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        renderPass.draw(1, dots.count);
        renderPass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        frameCount++;
    };

    const animationFrame = async (timestamp) => {
        uniform = uniformsStruct.createFilled({
            gravity: [0, 0],
            pointerLoc: pointerLoc,
            pointerHeld: pointerHeldNow,
            pointerPressed: !pointerHeldLastFrame && pointerHeldNow 
        });
        pointerHeldLastFrame = pointerHeldNow;
        device.queue.writeBuffer(uniformBuffer, 0, uniform.data);
        render();
        requestAnimationFrame(animationFrame);
    };
    requestAnimationFrame(animationFrame);
};

main();