export const computePass = (encoder, pipeline, bindGroup, binding=0,
                            workgroupCountX=1, workgroupCountY=1, workgroupCountZ=1) => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(binding, bindGroup);
    pass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    pass.end();
    return pass;
};