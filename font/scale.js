export const toClip = ({row, col}, {width, height}) => {
    const clip = [
        ((2 * col/ width) - 1),
        1 -(2 * row / height),
    ];
    return clip;
};