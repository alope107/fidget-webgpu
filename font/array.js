// Shallow, does not check for type, NaN, undefin
export const arrayEq = (a, b) => {
    return a.length === b.length &&
           a.every((e, i) => e === b[i]);
};