import { global_invocation_index } from "./linear_indexing.js";
import { rectStruct, circleStruct, uniformsStruct, physStruct } from "./structs.js";

export const computeShaderCode = /* wgsl */ `
${global_invocation_index}

${physStruct.code}
${rectStruct.code}
${circleStruct.code}
${uniformsStruct.code}

struct Manifold {
    collisionNormal: vec2f,
    penetrationDepth: f32 
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read_write> oldRects : array<Rect>; 
@group(0) @binding(2) var<storage, read_write> oldCircles : array<Circle>;
@group(0) @binding(3) var<storage, read_write> newRects : array<Rect>; 
@group(0) @binding(4) var<storage, read_write> newCircles : array<Circle>; 


// TODO: better workgroup size UPDATE THE GLOBAL INDEX CALC IF CHANGED
@compute @workgroup_size(8, 8, 1) fn moveRects(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>) {
        let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                         8*8*1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);
        if(id >= arrayLength(&oldRects)) { return; }

        // Just making sure we don't lose our bindings
        // TODO: Automatic binding creation
        _ = oldCircles[0].radius;
        _ = newCircles[0].radius;
        _ = oldRects[0].topLeft;
        _ = newRects[0].topLeft;
        _ = uniforms.pointerHeld;

        let newRect = &newRects[id];
        let oldRect = &oldRects[id];

        newRect.topLeft = oldRect.topLeft;
        newRect.bottomRight = oldRect.bottomRight;
        newRect.phys.velocity = oldRect.phys.velocity;


        // TODO: broad phase collision etc. etc.
        newRect.overlaps = 0;
        for(var i = 0u; i < arrayLength(&oldRects); i++) {
            let other = &oldRects[i];
            newRect.overlaps |= select(0u, 1u, rectOverlaps(oldRect, other) && id != i);
        }

        for(var i = 0u; i < arrayLength(&oldCircles); i++) {
            let circle = &oldCircles[i];
            newRect.overlaps |= select(0u, 1u, rectCircleOverlaps(oldRect, circle));
        }
        newRect.topLeft += newRect.phys.velocity;
        newRect.bottomRight += newRect.phys.velocity;
}

// to pointer or not to pointer
fn calcJ(p1 : Phys, p2 : Phys, normal : vec2f) -> f32 {
    let e = min(p1.restitution, p2.restitution);
    let vRel = p2.velocity - p1.velocity;
    let velAlongNormal = dot(vRel, normal);
    return select(
        (-(1+e) * velAlongNormal) / (p1.invMass + p2.invMass),
        0,
        velAlongNormal > 0
    ); // do not apply impulse if they are already separating
}


// Firefox complains about these pointers :'(
// Argument 'r1' at index 0 is a pointer of space Storage { access: StorageAccess(LOAD | STORE) }, which can't be passed into functions.
// ..should prob give up on using pointer here
fn rectOverlaps(r1 : ptr<storage, Rect, read_write>, r2: ptr<storage, Rect, read_write>) -> bool {
    return !(r1.bottomRight.x < r2.topLeft.x) &&
           !(r2.bottomRight.x < r1.topLeft.x) &&
           !(r1.bottomRight.y < r2.topLeft.y) &&
           !(r2.bottomRight.y < r1.topLeft.y);
}

// TODO: better workgroup size UPDATE THE GLOBAL INDEX CALC IF CHANGED
@compute @workgroup_size(8, 8, 1) fn moveCircles(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>) {
        let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                         8*8*1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);
        if(id >= arrayLength(&oldCircles)) { return; }

        // Just making sure we don't lose our bindings
        _ = oldCircles[0].radius;
        _ = newCircles[0].radius;
        _ = oldRects[0].topLeft;
        _ = newRects[0].topLeft;
        _ = uniforms.pointerHeld;

        let newCircle = &newCircles[id];
        let oldCircle = &oldCircles[id];
        newCircle.center = oldCircle.center;
        newCircle.phys.velocity = oldCircle.phys.velocity;

        // TODO: broad phase collision etc. etc.
        newCircle.overlaps = 0;
        for(var i = 0u; i < arrayLength(&oldCircles); i++) {
            let other = &oldCircles[i];
            let manifold = circleCollision(*oldCircle, *other);
            let normal = manifold.collisionNormal;
            let collides = !all(normal == vec2f()) && id != i;
            newCircle.overlaps |= select(0u, 1u, collides);
            if(collides) { // TODO: branchless?
                let j = calcJ(oldCircle.phys, other.phys, normal);
                var force = -j * oldCircle.phys.invMass * normal;
                if(length(force) > 1) {
                    force /= length(force);
                }
                newCircle.phys.velocity += force;

                let percent = 0.2;
                let slop = 0.03;

                // Allow a bit of penetration to avoid jitter
                let depth = max(manifold.penetrationDepth - slop, 0.0);

                let correction = (depth / (newCircle.phys.invMass + other.phys.invMass)) * percent * normal;
                // Directly correct position - not going through velocity
                newCircle.center -= newCircle.phys.invMass * correction;
            }
        }

        for(var i = 0u; i < arrayLength(&oldRects); i++) {
            let rect = &oldRects[i];
            newCircle.overlaps |= select(0u, 1u, rectCircleOverlaps(rect, oldCircle));
        }

        // TODO: general walls
        let scale = 0.001;
        let wall = 1.0/scale;

        let pointerRadius=.05;
        if(uniforms.pointerHeld > 0) {
            let delta = newCircle.center - (uniforms.pointerLoc*wall);
            let deltaLen = length(delta);
            if(deltaLen < newCircle.radius+(pointerRadius*wall)) {
                newCircle.phys.velocity += delta/6;
            }
        }

        newCircle.phys.velocity += uniforms.gravity;

        let maxSpeed = 5.0;
        let speed = length(newCircle.phys.velocity);
        // if(speed > maxSpeed) {
        //     newCircle.phys.velocity *= maxSpeed/speed;
        // }



        // TODO: Configurable / better base friction?
        newCircle.center += newCircle.phys.velocity;//*.9;

        newCircle.overlaps = 0;
        if(newCircle.center.y < -wall + newCircle.radius) {
            newCircle.center.y = -wall + newCircle.radius;
            newCircle.phys.velocity.y *= -newCircle.phys.restitution;
        }
        if(newCircle.center.y > wall - newCircle.radius) {
            newCircle.center.y = wall - newCircle.radius;
            newCircle.phys.velocity.y *= -newCircle.phys.restitution;
        }
        if(newCircle.center.x < -wall + newCircle.radius) {
            newCircle.center.x = -wall + newCircle.radius;
            newCircle.phys.velocity.x *= -newCircle.phys.restitution;
        }
        if(newCircle.center.x > wall - newCircle.radius) {
            newCircle.center.x = wall - newCircle.radius;
            newCircle.phys.velocity.x *= -newCircle.phys.restitution;
        }
}

fn circleCollision(c1 : Circle, c2: Circle) -> Manifold {
    let delta = c2.center - c1.center;
    let squaredDist = dot(delta, delta);
    let touchingDist = c1.radius + c2.radius;
    if(squaredDist < pow(touchingDist, 2)) {
        let dist = sqrt(squaredDist);
        if(dist == 0.0) { // Avoid divide by 0
            return Manifold(vec2(1, 0), c1.radius);
        }
        let penetrationDepth = touchingDist - dist;
        return Manifold(delta/dist, penetrationDepth);
    }
    return Manifold(vec2f(), 0);
}

// Adapted from https://stackoverflow.com/questions/401847/circle-rectangle-collision-detection-intersection
fn rectCircleOverlaps(r : ptr<storage, Rect, read_write>, c: ptr<storage, Circle, read_write>) -> bool {
    // TODO: cache rect center amnd dims?
    let rHalfDims = abs(vec2f(
        (r.bottomRight.x - r.topLeft.x) /2,
        (r.topLeft.y - r.bottomRight.y) /2
    ));
    let rCenter = vec2f(
        r.topLeft.x + rHalfDims.x,
        r.bottomRight.y - rHalfDims.y
    );

    let delta = abs(c.center - rCenter);

    if(delta.x > rHalfDims.x + c.radius ||
       delta.y >  rHalfDims.y + c.radius) {
        return false;
    }

    if(delta.x < rHalfDims.x ||
       delta.y <  rHalfDims.y) {
        return true;
    }

    let corner = delta - rHalfDims;
    let squaredCorner = dot(corner, corner);

    return squaredCorner < pow(c.radius, 2);
}
`;