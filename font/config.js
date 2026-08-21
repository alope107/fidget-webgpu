// Tunables!
const defaults = {
    text: "🐱💜",
    font: "Comic Sans",
    size: "300px",
    color: "white"
};

// does not currently validate params!
const configFromQueryParams = (defaultConfig=defaults) => {
    const params = new URLSearchParams(window.location.search);

    const conf = {};
    for(const [tunable, defaultVal] of Object.entries(defaultConfig)) {
        conf[tunable] = params.get(tunable) || defaultVal;
    }
    
    return conf;
};

export { defaults, configFromQueryParams };