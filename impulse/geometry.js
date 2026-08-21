export const unitCirclePointsWGSL = (polysPerCircle) => {
    const points = [];
    for(let i = 0; i <= polysPerCircle; i++) {
        const angle = 2*Math.PI*i/polysPerCircle;
        points.push([Math.cos(angle), Math.sin(angle)]);
    }
    const vecStrings = points.map(([x, y]) => `vec2f(${x}, ${y})`);
    return `
array(
${vecStrings}
);
`;
};