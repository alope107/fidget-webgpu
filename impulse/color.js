export const precomputeAlpha = ([r, g, b, a]) => [r*a, g*a, b*a, a];
export const randSolidColor = () => [Math.random(), Math.random(), Math.random(), 1.];
export const randPrecomputedAlphaColor = (a) => precomputeAlpha([Math.random(), Math.random(), Math.random(), a]);