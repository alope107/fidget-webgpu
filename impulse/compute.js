import { global_invocation_index } from "../shared/js/linear_indexing.js";
import { uniformsStruct, physStruct } from "./structs.js";

export const computeShaderCode = /* wgsl */ `
${global_invocation_index}

${physStruct.code}
${uniformsStruct.code}

struct Manifold {
    collisionNormal: vec2f,
    penetrationDepth: f32 
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read_write> oldRects : array<Phys>; 
@group(0) @binding(2) var<storage, read_write> oldCircles : array<Phys>;
@group(0) @binding(3) var<storage, read_write> newRects : array<Phys>; 
@group(0) @binding(4) var<storage, read_write> newCircles : array<Phys>; 


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
        _ = oldCircles[0].center;
        _ = newCircles[0].center;
        _ = oldRects[0].center;
        _ = newRects[0].center;
        _ = uniforms.pointerHeld;

        let newRect = &newRects[id];
        let oldRect = &oldRects[id];

        newRect.center = oldRect.center;
        newRect.halfDim = oldRect.halfDim;
        newRect.velocity = oldRect.velocity;


        // TODO: broad phase collision etc. etc.
        newRect.overlaps = 0;
        for(var i = 0u; i < arrayLength(&oldRects); i++) {
            let other = &oldRects[i];
            let manifold = rectCollision(*oldRect, *other);
            let normal = manifold.collisionNormal;
            let collides = !all(normal == vec2f()) && id != i;
            newRect.overlaps |= select(0u, 1u, collides);
            if(collides) { // TODO: branchless?
                resolveCollision(newRect, other, manifold);
            }
        }

        for(var i = 0u; i < arrayLength(&oldCircles); i++) {
            let circle = &oldCircles[i];
            var manifold = rectCircleCollision(*newRect, *circle);
            let normal = manifold.collisionNormal;
            let collides = !all(normal == vec2f()) && id != i;
            //manifold.collisionNormal = -manifold.collisionNormal;
            if(collides) { // TODO: branchless?
                resolveCollision(newRect, circle, manifold);
            }
        }
        pointerBoop(newRect);

        newRect.velocity += uniforms.gravity;
        newRect.center += newRect.velocity;
        newRect.overlaps = 0;

        wallBounce(newRect);
}


fn wallBounce(obj : ptr<storage, Phys, read_write>) {
    let wall = 1.0/uniforms.invWorldScale; // TODO: swap to wallCorner

    if(obj.center.y < -wall + obj.halfDim.y) {
        obj.center.y = -wall + obj.halfDim.y;
        obj.velocity.y *= -obj.restitution;
    }
    if(obj.center.y > wall - obj.halfDim.y) {
        obj.center.y = wall - obj.halfDim.y;
        obj.velocity.y *= -obj.restitution;
    }
    if(obj.center.x < -wall + obj.halfDim.x) {
        obj.center.x = -wall + obj.halfDim.x;
        obj.velocity.x *= -obj.restitution;
    }
    if(obj.center.x > wall - obj.halfDim.x) {
        obj.center.x = wall - obj.halfDim.x;
        obj.velocity.x *= -obj.restitution;
    }
}

fn pointerBoop(obj : ptr<storage, Phys, read_write>) {
    let wall = 1.0/uniforms.invWorldScale; // TODO: don't scale off wall

    // TODO: compute this once, not once per thread
    let pointerLoc = (uniforms.invCameraMat * vec3(uniforms.pointerLoc, 1)).xy;

    let pointerRadius=.05;
    if(uniforms.pointerHeld > 0) {
        let delta = obj.center - (pointerLoc*wall); // todo: don't scale based off of wall
        let deltaLen = length(delta);
        if(deltaLen < obj.halfDim.x+(pointerRadius*wall)) {
            obj.velocity += delta/6; // Todo: do by density?
        }
    }

}

// to pointer or not to pointer
fn calcJ(p1 : Phys, p2: Phys, normal : vec2f) -> f32 {
    let e = min(p1.restitution, p2.restitution);
    let vRel = p2.velocity - p1.velocity;
    let velAlongNormal = dot(vRel, normal);
    return select(
        (-(1+e) * velAlongNormal) / (p1.invMass + p2.invMass),
        0,
        velAlongNormal > 0
    ); // do not apply impulse if they are already separating
}

// Firefox doesn't allow for unrestricted pointers. Going to keep as-is for now,
// will perhaps pass by array id later. Sucks.  
// Only resolves for obj, not other
fn resolveCollision(obj: ptr<storage, Phys, read_write>, other: ptr<storage, Phys, read_write>, manifold: Manifold) {
    let normal = manifold.collisionNormal;
    let j = calcJ(*obj, *other, normal);
    var force = -j * obj.invMass * normal;
    if(length(force) > 1) {
        force /= length(force);
    }
    obj.velocity += force;

    let percent = 0.2;
    let slop = 0.03;

    // Allow a bit of penetration to avoid jitter
    let depth = max(manifold.penetrationDepth - slop, 0.0);

    let correction = (depth / (obj.invMass + other.invMass)) * percent * normal;
    // Directly correct position - not going through velocity
    obj.center -= obj.invMass * correction;
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
        _ = oldCircles[0].halfDim.x;
        _ = newCircles[0].halfDim.x;
        _ = oldRects[0].center;
        _ = newRects[0].center;
        _ = uniforms.pointerHeld;

        let newCircle = &newCircles[id];
        let oldCircle = &oldCircles[id];
        newCircle.center = oldCircle.center;
        newCircle.velocity = oldCircle.velocity;

        // TODO: broad phase collision etc. etc.
        newCircle.overlaps = 0;
        for(var i = 0u; i < arrayLength(&oldCircles); i++) {
            let other = &oldCircles[i];
            let manifold = circleCollision(*oldCircle, *other);
            let normal = manifold.collisionNormal;
            let collides = !all(normal == vec2f()) && id != i;
            newCircle.overlaps |= select(0u, 1u, collides);
            if(collides) { // TODO: branchless?
                resolveCollision(newCircle, other, manifold);
            }
        }

        for(var i = 0u; i < arrayLength(&oldRects); i++) {
            let rect = &oldRects[i];
            var manifold = rectCircleCollision(*rect, *newCircle);
            let normal = manifold.collisionNormal;
            let collides = !all(normal == vec2f()) && id != i;
            manifold.collisionNormal = -manifold.collisionNormal;
            newCircle.overlaps |= select(0u, 1u, collides);
            if(collides) { // TODO: branchless?
                resolveCollision(newCircle, rect, manifold);
            }
        }

        
        pointerBoop(newCircle);

        newCircle.velocity += uniforms.gravity;

        let maxSpeed = 5.0;
        let speed = length(newCircle.velocity);

        newCircle.center += newCircle.velocity;

        wallBounce(newCircle);
        newCircle.overlaps = 0;// Hack to temporarily turn off collision coloring, should really be config arg
}

fn rectCollision(r1 :Phys, r2:Phys) -> Manifold {
    let delta = r1.center - r2.center;

    let overlap = r1.halfDim + r2.halfDim - abs(delta);

    let overlappingMask = select(0., 1., overlap.x > 0 && overlap.y > 0);
    let dimensionMask = select( // choose axis of least penetration
        vec2f(1., 0.),
        vec2f(0., 1.),
        overlap.x > overlap.y
    );
    let direction = vec2f(
        select(1., -1., delta.x > 0),
        select(1., -1., delta.y > 0),
    );

    let penetration = select(overlap.x, overlap.y, overlap.x > overlap.y);
    return Manifold(
        overlappingMask * dimensionMask * direction,
        penetration * overlappingMask
    );
}

fn circleCollision(c1 :Phys, c2:Phys) -> Manifold {
    let delta = c2.center - c1.center;
    let squaredDist = dot(delta, delta);
    let touchingDist = c1.halfDim.x + c2.halfDim.x;
    if(squaredDist < pow(touchingDist, 2)) {
        let dist = sqrt(squaredDist);
        if(dist == 0.0) { // Avoid divide by 0
            return Manifold(vec2(1, 0), c1.halfDim.x);
        }
        let penetrationDepth = touchingDist - dist;
        return Manifold(delta/dist, penetrationDepth);
    }
    return Manifold(vec2f(), 0);
}

fn rectCircleCollision(rect: Phys, circle: Phys) -> Manifold {
    let delta = circle.center - rect.center;
    // clamp to edges of rect
    var closest = vec2f(
        clamp(delta.x, -rect.halfDim.x, rect.halfDim.x),
        clamp(delta.y, -rect.halfDim.y, rect.halfDim.y)
    );

    // TODO: branchless
    var inside = false;

    // circle is inside rect
    if(all(delta == closest)) {
        inside = true;
        // TODO: can be done with masks
        if(abs(delta.x) < abs(delta.y)) {
            closest.x = select(-rect.halfDim.x, rect.halfDim.x, closest.x > 0);
        } else {
            closest.y = select(-rect.halfDim.y, rect.halfDim.y, closest.y > 0);
        }
    }

    let normal = delta - closest;

    let lengthSquared = dot(normal, normal);
    if(lengthSquared > (circle.halfDim.x * circle.halfDim.x) && !inside) {
        return Manifold(vec2(), 0);
    }

    let len = sqrt(lengthSquared);//length(normal);
    return Manifold(
        normal * select(1., -1., inside),
        circle.halfDim.x - len
    );
}

`;