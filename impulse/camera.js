// Translates, then scales, 
const buildCamera = ([transX, transY], [scaleX, scaleY]) => {
    return [
        [scaleX, 0,      0],
        [0,      scaleY, 0],
        [scaleX*transX, scaleY*transY, 1]
    ];
};

export default buildCamera;