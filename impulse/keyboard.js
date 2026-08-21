// TODO: Think about better sync with frame...
class KeyChecker {
    constructor(keys) {
        this.state = {};
        for(const key of keys) {
            this.state[key] = {
                held: false,
                heldLastFrame: false,
                justPressed: false,
                justReleased: false
            };
        }
        document.addEventListener("keydown", (event) => {
                for(const [key, data] of Object.entries(this.state)) {
                    if(event.key === key) {
                        data.held = true;
                    }
                } 
            }
        );
        document.addEventListener("keyup", (event) => {
                for(const [key, data] of Object.entries(this.state)) {
                    if(event.key === key) {
                        data.held = false;
                    }
                } 
            }
        );
    }

    // to be called once per frame
    tick() {
        for(const data of Object.values(this.state)) {
            data.justPressed = false;
            data.justReleased = false;
        }
    }

    // Could be done with dynamic getters, will do the less fancy way for now
    get(key) {
        return this.state[key];
    }
}

export default KeyChecker;