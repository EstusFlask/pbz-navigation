"use strict";
const mix = (a, b, t) => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
function screen(uv, player, width, height, size, degrees) {
    const x=(uv.x-player[0])*width, y=(uv.y-player[1])*height;
    const a=degrees*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
    return {x:size/2+x*c-y*s, y:size/2+x*s+y*c};
}
function clip(a, b, size, circle, padding=5) {
    if (![a.x,a.y,b.x,b.y,size].every(Number.isFinite) || size<=padding*2) return null;
    const dx=b.x-a.x, dy=b.y-a.y;
    let lo=0, hi=1;
    if (circle) {
        const x=a.x-size/2, y=a.y-size/2, radius=size/2-padding, den=dx*dx+dy*dy;
        if (den<1e-12) return x*x+y*y<=radius*radius ? [a,b] : null;
        const dot=x*dx+y*dy, discr=dot*dot-den*(x*x+y*y-radius*radius);
        if (discr<0) return null;
        const root=Math.sqrt(discr);
        lo=Math.max(0,(-dot-root)/den); hi=Math.min(1,(-dot+root)/den);
    } else {
        for (const [p,q] of [[-dx,a.x-padding],[dx,size-padding-a.x],[-dy,a.y-padding],[dy,size-padding-a.y]]) {
            if (!p) { if (q<0) return null; continue; }
            const t=q/p;
            if (p<0) lo=Math.max(lo,t); else hi=Math.min(hi,t);
        }
    }
    return lo>hi ? null : [mix(a,b,lo),mix(a,b,hi)];
}
function inside(p,size,circle,padding=10) {
    return circle ? Math.hypot(p.x-size/2,p.y-size/2)<size/2-padding :
        p.x>=padding&&p.y>=padding&&p.x<=size-padding&&p.y<=size-padding;
}
exports.screen=screen; exports.clip=clip; exports.inside=inside;
