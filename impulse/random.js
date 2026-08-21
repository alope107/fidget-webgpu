export const randRange =  (min, max) => Math.random() * (max-min) + min;
export const randClip = () => randRange(-1, 1); 