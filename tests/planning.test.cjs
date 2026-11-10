'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function planner(world,options={}){
    const p={x:0,y:0,z:0},goal={x:100,y:0,z:600};
    const partial={IsValid:()=>true,IsPartial:()=>options.complete?false:true,PathPoints:{Num:()=>2,Get:i=>i?p:goal}};
    // The engine's incomplete path stops directly below the upstairs item.
    partial.PathPoints.Num=()=>options.detour?4:2;
    partial.PathPoints.Get=i=>{
        const ps=options.detour?[p,{x:0,y:700,z:0},{x:goal.x,y:700,z:goal.z},goal]:[p,{...goal,z:options.complete?goal.z:0}];
        const q=ps[i];return {X:q.x,Y:q.y,Z:q.z};
    };
    const UE={ESlateVisibility:{HitTestInvisible:0,Collapsed:1},ESplineCoordinateSpace:{World:0},
        NavigationSystemV1:{FindPathToLocationSynchronously:()=>partial},BellManager:{StaticClass(){}}};
    const W={finite:q=>q&&Number.isFinite(q.z),alive:o=>!!o,vec:q=>q,
        plain:q=>({x:q.X,y:q.Y,z:q.Z})};
    const empty=function*(){return null;};
    const mocks={ue:UE,puerts:{},'Library/TsHelper':{default:{getWorldSubsystem:()=>({})}},'Library/MapAreaGroups':{},
        './PBZRouteTables':{data:{worlds:['test'],bells:{}}},
        './PBZRouteWorld':W,'./PBZRoutePassages':options.passages||{refreshLadders(){},isLookout:()=>false,liveRouteJob:empty},
        './PBZRouteDrops':{installJob:empty},'./PBZRouteObstacles':{...require(root+'/PBZRouteObstacles'),installSeamsJob:empty},
        './PBZRouteSurface':{anchorsJob:function*(g,q,goal){return [{id:goal?1:0,q:{...q},r:0,dz:0}];}},
        './PBZPrivateRibbon':{},'./PBZRouteInk':{},'./PBZRouteItems':{},'./PBZRouteMinimap':{},'./PBZRouteScout':{}};
    const module={exports:{}};
    const local=id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id));
    const source=fs.readFileSync(root+'/PBZQuestRoute.js','utf8')+'\nexports.test={S,graphs,makePlan,nativeWalk};';
    vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{console,Date})(local,module,module.exports);
    const api=module.exports.test,g=options.graph||{name:'test',sameComponent:()=>false,actors:[],observedPassages:new Map(),routeJob:function*(){return null;}};
    api.graphs.set('test',g);Object.assign(api.S,{level:'test',pawn:{},world:{...world,feet:()=>p}});
    return {api,goal,dest:{key:'upstairs',item:true,p:goal,world:'test'}};
}
function run(job){let row,steps=0;do{row=job.next();assert.ok(++steps<100000,'search did not yield a bounded result');}while(!row.done);return row.value;}
function staircase(){
    // Three parallel flights, connected by their landings. A direct approach
    // to x=100,y=0 remains on the ground floor.
    const floor=p=>{
        if(p.y>=-70&&p.y<=70&&p.x>=-80&&p.x<=1000)return 0;
        if(p.x>=930&&p.x<=1070&&p.y>=0&&p.y<=600)return p.y/2;
        if(p.y>=530&&p.y<=670&&p.x>=100&&p.x<=1070)return 300+(1000-p.x)/3;
        return null;
    };
    return {floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
        step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<=100?{p:{...b,z}}:{why:'wall or absent floor'};}};
}
test('a three-floor collectible uses the staircase instead of a ground-floor partial path',()=>{
    const h=planner(staircase());
    // Upstairs landing endpoint of the final flight.
    h.goal.x=100;h.goal.y=600;h.goal.z=600;
    const result=run(h.api.makePlan(h.dest));
    const leg=result?.legs.at(-1);
    assert.ok(leg&&!leg.partial,'route stopped under the target instead of climbing');
    assert.ok(Math.abs(leg.points.at(-1).z-600)<80);
    assert.ok(leg.points.some(p=>p.x>=900&&p.y>200),'staircase entrance was skipped');
});
test('no walking connection must not claim arrival on the wrong floor, even with an X preview',()=>{
    const h=planner({floorAt:p=>p.z===0?{...p}:null,step:(a,b)=>({p:{...b,z:0}})});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(!result||result.legs[0].diagnostic&&result.legs[0].partial,'an incomplete downstairs path was presented as a valid arrival');
    if(result){const leg=result.legs[0];assert.ok(leg.points.slice(0,leg.verifiedEndIndex+1).every(p=>p.z===0));}
});
test('local staircase search is bounded and cannot jump vertically to a disconnected platform',()=>{
    const Local=require(root+'/PBZRouteLocalWalk');let probes=0;
    const world={floorAt:p=>({...p}),step:(a,b)=>{probes++;return {p:{...b,z:a.z}};}};
    const result=run(Local.search(world,{x:0,y:0,z:0},{x:100,y:0,z:1000},{maxNodes:2}));
    assert.equal(result,null);assert.ok(probes<=16);
});
test('same-floor routes must detour around a wall even if the native path claims to be complete',()=>{
    const blocked=(a,b)=>Math.min(a.x,b.x)<250&&Math.max(a.x,b.x)>=250&&Math.abs((a.y+b.y)/2)<250;
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>blocked(a,b)?{why:'solid wall',hit:{x:250,y:0,z:0}}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:560,y:0,z:0});
    const result=run(h.api.makePlan(h.dest)),leg=result?.legs[0];
    assert.ok(leg,'no feasible detour was found');
    assert.ok(leg.points.some(p=>Math.abs(p.y)>=250),'the returned route still goes straight through the wall');
    for(let i=1;i<leg.points.length;i++)assert.ok(!blocked(leg.points[i-1],leg.points[i]));
});
test('checked grid search minimizes feasible 3D length rather than a weighted straight-line guess',()=>{
    const Local=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore'),cells=new Map();
    const key=p=>p.x+','+p.y;
    const put=(x,y,z)=>cells.set(x*70+','+y*70,{x:x*70,y:y*70,z});
    for(let x=0;x<=8;x++){put(x,0,Math.min(x,8-x)*70);put(x,4,0);}
    for(let y=1;y<4;y++){put(0,y,0);put(8,y,0);}
    const world={floorAt:p=>cells.get(key(p))||null,step:(a,b)=>{
        const p=cells.get(key(b));return p&&R.xy(a,p)<=100&&Math.abs(p.z-a.z)<=100?{p}:{why:'no edge'};
    }};
    const start=cells.get('0,0'),goal=cells.get('560,0'),dist=new Map([[key(start),0]]),open=[start];
    while(open.length){open.sort((a,b)=>dist.get(key(a))-dist.get(key(b)));const a=open.shift();
        for(const b of cells.values())if(b!==a&&world.step(a,b).p){const d=dist.get(key(a))+R.dist(a,b);if(d<(dist.get(key(b))??Infinity)){dist.set(key(b),d);open.push(b);}}
    }
    const route=run(Local.search(world,start,goal,{clock:()=>0}));
    assert.ok(route);assert.ok(Math.abs(route.meters*100-dist.get(key(goal)))<.01,
        'returned '+route.meters*100+' instead of feasible shortest length '+dist.get(key(goal)));
});
test('a longer but feasible native route is compared with the shorter checked local route',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const h=planner(world,{complete:true,detour:true});Object.assign(h.goal,{x:560,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(Math.abs(result.legs[0].meters-5.6)<.001,'kept the 19.6 m native detour instead of the 5.6 m feasible path');
});
test('having a ladder later in a leg does not skip checking an earlier walking wall',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const world={floorAt:p=>p,step:()=>({why:'blocked wall'})};
    const points=[{x:0,y:0,z:0},{x:100,y:0,z:0},{x:100,y:0,z:600}];
    const leg={points,moves:[{kind:'ladder',from:1,to:2}],walks:[{from:0,to:1,edge:5}],checks:[]};
    const result=run(F.check(world,leg,points[0]));
    assert.equal(result.ok,false);assert.equal(result.edge,5);
});
test('a complete feasible route wins over a shorter verified streaming prefix',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:7000,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.equal(result.legs[0].partial,false);assert.equal(result.legs[0].points.at(-1).x,7000);
});
test('downstairs search follows the same supported staircase instead of falling through the floor',()=>{
    const Local=require(root+'/PBZRouteLocalWalk');
    const route=run(Local.search(staircase(),{x:100,y:600,z:600},{x:0,y:0,z:0}));
    assert.ok(route);assert.equal(route.points.at(-1).z,0);
    assert.ok(route.points.some(p=>p.x>900&&p.z>100&&p.z<400));
});
test('checked off-grid doorway samples allow a narrow opening which the coarse grid misses',()=>{
    const Local=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore');
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>{
        const n=Math.max(1,Math.ceil(R.xy(a,b)/5));
        for(let i=0;i<=n;i++){const p=R.lerp(a,b,i/n);if(p.x>=260&&p.x<=300&&(p.y<30||p.y>40))return {why:'door frame'};}
        return {p:{...b,z:0}};
    }};
    const route=run(Local.search(world,{x:0,y:0,z:0},{x:560,y:0,z:0},
        {waypoints:[{x:245,y:35,z:0},{x:280,y:35,z:0},{x:315,y:35,z:0}],clock:()=>0}));
    assert.ok(route);
    for(let i=1;i<route.points.length;i++)assert.ok(world.step(route.points[i-1],route.points[i]).p);
    assert.ok(route.points.some(p=>p.x>=260&&p.x<=300&&p.y>=30&&p.y<=40));
});
test('walking validation replaces buried atlas heights with the actual supporting floor',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const leg={points:[{x:0,y:0,z:-134},{x:1000,y:0,z:-134}],checks:[],moves:[],walks:[]};
    const checked=run(F.check(world,leg,{x:0,y:0,z:0}));
    assert.equal(checked.ok,true);assert.ok(checked.leg.points.every(p=>p.z===0));
    assert.ok(leg.points.every(p=>p.z===-134),'input atlas data was changed');
});
test('a long flat collectible route repairs a small rock instead of rejecting the whole route',()=>{
    const R=require(root+'/PBZRouteCore');
    const blocked=(a,b)=>{const n=Math.max(1,Math.ceil(R.xy(a,b)/10));for(let i=0;i<=n;i++){const p=R.lerp(a,b,i/n);if(p.x>=1600&&p.x<=1900&&Math.abs(p.y)<180)return true;}return false;};
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>blocked(a,b)?{hit:{x:1600,y:0,z:0},why:'rock'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:9300,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(result&&!result.legs[0].partial,'small rock removed a reachable route beyond 90 m');
    assert.ok(result.legs[0].points.some(p=>Math.abs(p.y)>=180));
    assert.equal(result.legs[0].points.at(-1).x,9300);
});
test('a blocking candidate is published early with an X, a safe prefix and an unfinished tail',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>Math.max(a.x,b.x)>=400?{hit:{x:400,y:0,z:0},why:'wall'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:1000,y:0,z:0});
    const seen=[],context={onDiagnostic:trip=>seen.push(trip)};
    const job=h.api.makePlan(h.dest,false,false,false,context);
    for(let i=0;i<100&&!seen.length;i++)assert.equal(job.next().done,false);
    assert.ok(seen.length,'nothing was displayed while detour search was pending');
    const leg=seen[0].legs[0];assert.equal(leg.diagnostic,true);assert.equal(leg.partial,true);
    assert.ok(leg.verifiedEndIndex>0);assert.ok(leg.obstacles.some(o=>o.icon==='barrier'));
    assert.ok(leg.points[leg.verifiedEndIndex].x<400);
    const result=run(job);assert.ok(result.legs[0].diagnostic,'failed search cleared the blocked route');
    const cuts=require(root+'/PBZRouteObstacles').intervals(leg);
    assert.ok(cuts.some(c=>c.unknown&&c.hi>=leg.meters*100-1),'unchecked tail was not shown as unfinished');
});
test('a collectible approach may stop beside its collider without requiring a path through the object',()=>{
    const R=require(root+'/PBZRouteCore');
    const inside=p=>R.xy(p,{x:1000,y:0,z:0})<65;
    const world={floorAt:p=>inside(p)?null:{...p,z:0},step:(a,b)=>inside(b)?{hit:b,why:'collectible collider'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:1000,y:0,z:120});h.dest.provider='187';
    const result=run(h.api.makePlan(h.dest));
    assert.ok(result&&!result.legs[0].partial);const end=result.legs[0].points.at(-1);
    assert.ok(R.xy(end,h.goal)>=65&&R.xy(end,h.goal)<=185);assert.equal(end.z,0);
});
test('the main navigation planner retains the ladder-plus-hook action chain',()=>{
    const R=require(root+'/PBZRouteCore'),module={exports:{}},UE={ESplineCoordinateSpace:{World:0}};
    const mocks={ue:UE,puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'Library/TsHelper':{default:{}},'./PBZRouteWorld':{alive:o=>!!o}};
    vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\n})',{Date,console})
        (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
    const floor=p=>p.x>=-100&&p.x<=500?0:p.x>=650&&p.x<=900?600:p.x>=1100&&p.x<=1500?1200:null;
    const world={normal:.7,rise:45,slope:1,floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
        step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<80?{p:{...b,z}}:{why:'gap'};},
        hit:(a,b,body)=>{if(body)return null;const z=floor(a);return z!==null&&z<=a.z&&z>=b.z?{point:{x:a.x,y:a.y,z},nz:1}:null;}};
    const actors=[{kind:'ladder',guid:'ladder',both:true,path:[[500,0,0],[650,0,600]]},
        {kind:'swing',guid:'hook',both:true,path:[[900,0,600],[1100,0,1200]]}];
    const g={name:'test',actors,observedPassages:new Map(),openPassages:new Set(),canTraverse:()=>true,sameComponent:()=>false,routeJob:function*(){return null;}};
    const h=planner(world,{passages:module.exports,graph:g});Object.assign(h.goal,{x:1400,y:0,z:1200});
    const trip=run(h.api.makePlan(h.dest));assert.ok(trip&&!trip.legs[0].partial);
    assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['ladder','swing']);
    for(const w of trip.legs[0].walks)assert.ok(world.step(w.a,w.b).p);
    assert.ok(R.dist(trip.legs[0].points.at(-1),h.goal)<1);
});
test('a sparse path over connected uneven ground is not rejected by its straight height interpolation',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const height=x=>Math.max(0,400-Math.abs(x-500)*.8);
    const world={floorAt:p=>({...p,z:height(p.x)}),step:(a,b,expected)=>{
        const z=height(b.x);return expected&&Math.abs(z-b.z)>200?{why:'stacked floor mismatch'}:{p:{...b,z}};
    }};
    const source={points:[{x:0,y:0,z:0},{x:1000,y:0,z:0}],moves:[],walks:[],checks:[]};
    const result=run(F.check(world,source,source.points[0]));
    assert.equal(result.ok,true,'connected terrain was treated as another floor');
    assert.ok(Math.max(...result.leg.points.map(p=>p.z))>380);
});
test('collectible approach points do not treat a closed door as the target collider',()=>{
    const Goals=require(root+'/PBZRouteGoals'),point={x:1000,y:0,z:120};
    const world={floorAt:p=>({...p,z:0}),hit:(a,b,body)=>body?null:a.x<1000?
        {point:{x:990,y:0,z:100},owners:['BP_ClosedDoor']}:{point,owners:['BP_Rubbish_123']}};
    const goals=run(Goals.approaches(world,point,140,{targetKey:'pbz:world:BP_Rubbish_123'}));
    assert.ok(goals.length);assert.ok(goals.every(p=>p.x>=1000));
});
