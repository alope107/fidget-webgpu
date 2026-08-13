const toClipSpace = ([worldX, worldY], [worldWidth, worldHeight]) => {
    return [
        (2 * worldX / worldWidth) - 1,
        -((2 * worldY / worldHeight) - 1)
    ];
};
export default toClipSpace;