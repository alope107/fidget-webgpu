export const dist = (p1, p2) =>  Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2);

export const intersection = /* wgsl */`
// xy is intersection point iff z != 0
// if z = 0 then no intersection
fn intersection(s1 : vec2f, e1 : vec2f, s2 : vec2f, e2 : vec2f) -> vec3f {
    // return vec3(1., 1., 1.);
    let line1cross = cross(vec3(s1, 1.), vec3(e1, 1.));
    let line2cross = cross(vec3(s2, 1.), vec3(e2, 1.));

    let crossCross = cross(line1cross, line2cross);

    //TODO select?
    if(crossCross.z == 0) {return vec3(0, 0, 0);}
    // return vec3f(1.,1.,1.);
    let intersection = crossCross / crossCross.z;

    // TODO smarter
    return select(vec3(),
        intersection,
        ((intersection.x < s1.x) != (intersection.x < e1.x)) &&
       ((intersection.y < s1.y) != (intersection.y < e1.y)) &&
       ((intersection.x < s2.x) != (intersection.x < e2.x)) &&
       ((intersection.y < s2.y) != (intersection.y < e2.y))
    );
}
`

export const barycentric = /* wgsl */`

// Returns the barycentric coordinates of p in the triangle t1t2t3
fn barycentric(p : vec2f, t1 : vec2f, t2 : vec2f, t3 : vec2f) -> vec3f {
    let denom = ((t2.y-t2.y)*(t1.x-t3.x) + (t3.x-t2.x)*(t1.y-t3.y));
    let a = ((t2.y-t3.y)*(p.x-t3.x) + (t3.x-t2.x)*(p.y-t3.y))/denom;
    let b = ((t3.y-t1.y)*(p.x-t3.x)+(t1.x-t3.x)*(p.y-t3.y))/denom;
    let c = 1. - a - b;
    return vec3f(a, b, c);
} 

// Returns whether p lies in triangle t1t2t3
fn pointInTri(p : vec2f, t1 : vec2f, t2 : vec2f, t3 : vec2f) -> bool {
    let bary = barycentric(p, t1, t2, t3);
    return all(bary >= vec3f()) && all( bary <= vec3f(1., 1., 1.));
} 
`;