"use strict";
const UE=require('ue'), T=require('Library/TsHelper').default;
const W=require('./PBZRouteWorld'), R=require('./PBZRouteCore');
const Charts=require('./PBZRouteCartography'), G=require('./PBZRouteMiniGeometry'),Obstacles=require('./PBZRouteObstacles');
const V=(x,y)=>new UE.Vector2D(x,y), visible=UE.ESlateVisibility.HitTestInvisible, hidden=UE.ESlateVisibility.Collapsed;
class MinimapRoute {
    constructor(path,log) { this.path=path; this.log=log; this.views=new WeakMap(); this.hosts=new Set(); }
    remove(host) {
        const s=this.views.get(host);
        if (s && W.alive(s.canvas)) s.canvas.RemoveFromParent();
        this.views.delete(host); this.hosts.delete(host);
    }
    clearAll() { for (const host of this.hosts) this.remove(host); }
    hide(view) {
        const s=this.views.get(view.host);
        if (s?.shown) { s.canvas.SetVisibility(hidden); s.shown=false; }
    }
    layer(view) {
        let s=this.views.get(view.host);
        if (s && W.alive(s.canvas)) return s;
        const canvas=UE.NewObject(UE.CanvasPanel.StaticClass(),view.host), slot=view.viewport.AddChildToCanvas(canvas);
        canvas.SetVisibility(hidden); slot.SetPosition(V(0,0)); slot.SetZOrder(5);
        s={canvas,slot,images:[],textures:{},shown:false,key:'',traces:[],at:0};
        this.views.set(view.host,s); this.hosts.add(view.host); return s;
    }
    draw(view,player,rotation,S,enabled) {
        // This draws the existing trip; it never searches or builds a graph.
        if (!S.cfg.MinimapRoute || !enabled || !S.trip || !S.world || S.arrival.isDone(S) ||
            !view.domain || player.heightComparable===false) { this.hide(view); return; }
        const s=this.layer(view), now=Date.now();
        const size=view.viewSize, width=view.mapWidth, height=view.mapHeight;
        if (!(width>0&&height>0&&size>0)) {this.hide(view);return;}
        const key=[S.version,S.active,view.domain.key].join('/');
        if (s.key!==key) {
            const map=T.getWorldSubsystem(view.pc,UE.MapSubsystem.StaticClass());
            const ids=new Set(view.domain.allowedMapIDs.map(x=>String(x).toLowerCase()));
            ids.add(String(view.domain.displayMapID).toLowerCase());
            const belongs=p=>{const id=String(map.GetMapIDByLocation(W.vec(p))||'').toLowerCase();return !id||id==='none'||ids.has(id);};
            const project=(p,area)=>{const q=map.ProjectWorldLocationToMap(W.vec(p),area||view.domain.displayMapID);return q?{x:Number(q.X),y:Number(q.Y)}:null;};
            s.traces=[];s.blocks=[];
            for (let index=S.active;index<S.trip.legs.length;index++) {
                const leg=S.trip.legs[index];
                if (leg.world!==S.level) continue;
                s.traces.push({leg,index,trace:Charts.projectLeg(leg.points,project,belongs)});
                for(const block of leg.locks||[])if(belongs(block.p)){const uv=project(block.p);if(Charts.finite(uv))s.blocks.push({uv,unknown:block.unknown,icon:block.icon||'mechanism'});}
            }
            s.transfer=null;
            const transfer=S.active===0&&S.trip.transfer;
            if (transfer && ids.has(String(transfer.from.area).toLowerCase()) && ids.has(String(transfer.to.area).toLowerCase())) {
                const p=b=>({x:b.at[0],y:b.at[1],z:b.at[2]});
                const a=project(p(transfer.from),transfer.from.area),b=project(p(transfer.to),transfer.to.area);
                if (Charts.finite(a)&&Charts.finite(b)) s.transfer=[a,b];
            }
            const endLeg=S.trip.legs[S.trip.legs.length-1],end=endLeg.points[endLeg.points.length-1];
            s.end=endLeg.world===S.level&&end&&belongs(end)?project(end):null;
            s.key=key;
            this.log('minimap route','version='+S.version+' chart='+view.domain.displayMapID+' legs='+s.traces.length);
        }
        if (!s.shown) { s.canvas.SetVisibility(visible); s.shown=true; }
        // Coalesce duplicate callbacks while still following the actual minimap
        // camera and player, rather than the navigation solver's slower timer.
        const circle=!!view.mask?.getStatus().active;
        const signature=[player.uv[0],player.uv[1],rotation,width,height,size,circle,key].join('/');
        if (s.signature===signature) return;
        if (s.signature && now-s.at<15) return;
        s.at=now; s.signature=signature; s.slot.SetSize(V(size,size));
        const screen=uv=>G.screen(uv,player.uv,width,height,size,rotation);
        let used=0;
        const image=(name,x,y,w,h,angle,tint)=>{
            let ob=s.images[used++];
            if (!ob) {
                const widget=UE.NewObject(UE.Image.StaticClass(),view.host),slot=s.canvas.AddChildToCanvas(widget);
                slot.SetAlignment(V(.5,.5)); widget.SetRenderTransformPivot(V(.5,.5));
                ob={widget,slot}; s.images.push(ob);
            }
            if (ob.name!==name) {
                const tex=s.textures[name]||(s.textures[name]=UE.KismetRenderingLibrary.ImportFileAsTexture2D(view.host,this.path+name+'.png'));
                if (!tex) {ob.widget.SetVisibility(hidden);return;}
                ob.widget.SetBrushFromTexture(tex,false); ob.name=name;
            }
            ob.slot.SetPosition(V(x,y)); ob.slot.SetSize(V(w,h));
            ob.widget.SetRenderTransformAngle(angle);
            ob.widget.SetColorAndOpacity(tint); ob.widget.SetVisibility(visible);
        };
        const white=new UE.LinearColor(1,1,1,1), transferColor=new UE.LinearColor(.96,.87,.69,1);
        const segment=(a,b,dashed=false,tint=null)=>{
            const cut=G.clip(a,b,size,circle,5);
            if (!cut) return;
            for (const [m,n] of dashed?Charts.dashes(cut[0],cut[1],8,5):[cut]) {
                const length=R.xy(m,n);
                if (length<.35) continue;
                image('pencil',(m.x+n.x)/2,(m.y+n.y)/2,length+(dashed?0:1.2),dashed?5:6,
                    Math.atan2(n.y-m.y,n.x-m.x)*180/Math.PI,tint||(dashed?transferColor:white));
            }
        };
        const foot=S.world.feet();
        for (const {leg,index,trace} of s.traces) {
            const near=index===S.active?R.nearestOnLine(foot,leg.points):null;
            const trim=near?.p&&near.d<235?trace.offsets[near.i]+(trace.offsets[near.i+1]-trace.offsets[near.i])*near.t:0;
            for (const run of trace.runs) {
                for(const part of Obstacles.portions(run,trim,Obstacles.intervals(leg))){
                const points=part.points;
                let previous=points.length?screen(points[0]):null;
                for (let i=1;i<points.length;i++) {
                    const next=screen(points[i]); segment(previous,next,part.style!=='walk',part.style==='blocked'?new UE.LinearColor(1,.13,.08,1):null); previous=next;
                }
            }
        }
        }
        for(const block of s.blocks||[]){const p=screen(block.uv);if(!G.inside(p,size,circle,16))continue;
            const tint=block.unknown?transferColor:new UE.LinearColor(1,.13,.08,1);
            if(block.icon==='barrier'){
                for(const [x1,y1,x2,y2]of [[-8,-7,8,7],[-8,7,8,-7]])
                    image('pencil',p.x+(x1+x2)/2,p.y+(y1+y2)/2,Math.hypot(x2-x1,y2-y1),5,Math.atan2(y2-y1,x2-x1)*180/Math.PI,tint);
            }else image(block.icon,p.x,p.y,25,27,0,tint);
        }
        if (s.transfer) segment(screen(s.transfer[0]),screen(s.transfer[1]),true);
        if (Charts.finite(s.end)) {
            const p=screen(s.end);
            if (G.inside(p,size,circle,18)) image('pinned',p.x+6,p.y-9,23,23,0,white);
        }
        for (let i=used;i<s.images.length;i++) s.images[i].widget.SetVisibility(hidden);
        // The mask belongs to #187; clipping this overlay mathematically keeps
        // its white route within the same circular footprint without touching it.
        globalThis.__PBZQuestRouteMinimapStatus={version:S.version,chart:view.domain.displayMapID,segments:used,error:''};
    }
}
exports.MinimapRoute=MinimapRoute;
