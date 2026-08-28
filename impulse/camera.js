// Translates, then scales
// World space -> Camera space
const buildCamera = ([transX, transY], [scaleX, scaleY]) => {
    return [
        [scaleX, 0,      0],
        [0,      scaleY, 0],
        [scaleX*transX, scaleY*transY, 1]
    ];
};

// Camera space -> worldSpace
const buildInvCamera = ([transX, transY], [camScaleX, camScaleY], [invWorldScaleX, invWorldScaleY]) => {
    return [
        [invWorldScaleX/camScaleX, 0,                          0],
        [0,                        invWorldScaleY/camScaleY,   0],
        [-transX * invWorldScaleX, -transY * invWorldScaleY,   1]
    ];
}

export {buildCamera, buildInvCamera};