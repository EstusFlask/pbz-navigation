"use strict";
// Optional adapter for the separately installed Map Tracker Plus 0.6.7.
// Uses its module exports and live session; no author files are replaced.
const UE=require('ue'), P=require('puerts'), T=require('Library/TsHelper').default;
const UI=require('Library/UIHelper').default;
const alive=o=>!!o&&UE.KismetSystemLibrary.IsValid(o);
const accessory=p=>[p?.category,p?.label,...(p?.contents||[]).map(x=>x.kind)].some(x=>['饰品','饰品碎片','accessory'].includes(x));
function adapt(load, log=console.log) {
    const api=load('PbzTrackerTarget'), map=load('PbzMapTracker');
    const guide=load('PbzCollectibleGuide'), style=load('PbzMarkerStyle');
    const runtime=load('PbzCollectibleRuntime'), cfg=load('PbzTrackerConfig');
    const projection=load('PbzMapProjection'), auto=load('PbzAutoTracking');
    let session=null, hintSession=null;
    const options=()=>globalThis.PBZQuestRouteBridge?.options?.()||{};
    const deps={UE,puerts:P,TsHelper:T,UIHelper:UI,
        isCollected:p=>runtime.getCurrent()?.repo.get(p.key)?.collected===true,
        canShowTarget:p=>runtime.getCurrent()?.repo.get(p.key)?.visible===true};
    // A selects once. Holding A is handled by the navigation input gate.
    const toggle=guide.toggle;
    guide.select=(host,point,dependencies)=>{
        const current=api.read().target;
        if(current?.key===point.key&&current.trackingMode!=='auto'&&!current.hintOnly)return true;
        if(current?.key===point.key&&current.hintOnly)api.set({...current,trackingMode:'auto'},'manual selection');
        toggle(host,{...point,hintOnly:false},dependencies);
        return api.read().target?.key===point.key;
    };
    const confirm=map.tryGuideTarget;
    map.tryGuideTarget=function(host,...args){
        if(globalThis.PBZQuestRouteBridge?.confirmMapTarget?.(host))return true;
        return confirm.call(this,host,...args);
    };
    const markerCreate=style.createMarker, markerUpdate=style.updateMarker;
    style.createMarker=function(...args){
        const marker=markerCreate.apply(this,args);
        marker.__routeOriginalScale=marker.layout?.scale;
        return marker;
    };
    style.updateMarker=function(marker,...args){
        const enabled=options().LargeItemIcons!==false;
        if(marker?.layout&&Number.isFinite(marker.__routeOriginalScale))marker.layout.scale=marker.__routeOriginalScale*(enabled?2:1);
        // The author recalculates layers on size changes. Invalidate only when our style changes.
        if(marker&&marker.__routeLarge!==enabled){marker.width=undefined;marker.__routeLarge=enabled;}
        const result=markerUpdate.call(this,marker,...args);
        for(const image of [marker?.frame,marker?.mask])if(alive(image))image.SetVisibility(enabled?UE.ESlateVisibility.Collapsed:UE.ESlateVisibility.HitTestInvisible);
        return result;
    };
    const mapStyle=host=>{
        const enabled=options().LargeItemIcons!==false;
        for(const row of host.focusItemMap?.values?.()||[]){
            const widget=row.widget;if(!row.pbzCollectible||!alive(widget))continue;
            for(const badge of widget.__pbzBadge||[])if(alive(badge)&&enabled)badge.SetVisibility(UE.ESlateVisibility.Collapsed);
            const scale=widget.__pbzContentLayout?.scale||.44;
            widget.Image_29?.SetRenderScale(new UE.Vector2D(scale*(enabled?2:1),scale*(enabled?2:1)));
        }
    };
    for(const key of ['updateMarkerSizes','syncMarkerBadges']){
        const original=map[key];
        map[key]=function(host,...args){const result=original.call(this,host,...args);mapStyle(host);return result;};
    }
    function clearHint(reason){if(api.read().target?.__routeAccessoryHint)guide.stop(reason);}
    function hint(){
        const current=api.read().target;
        const explicit=globalThis.PBZQuestRouteBridge?.hasExplicitTarget?.();
        if(options().AutoAccessory===false||cfg.get('guide.enabled')===false||cfg.get('guide.autoTrack')===true||explicit){clearHint('accessory hint paused');return;}
        if(current&&!current.__routeAccessoryHint)return;
        const gi=P.argv.getByName('GameInstance'),pc=gi&&UE.GameplayStatics.GetPlayerController(gi,0),pawn=pc?.K2_GetPawn();
        if(!alive(pc)||!alive(pawn)){clearHint('waiting for player');return;}
        if(hintSession?.world!==pc.GetWorld()){
            hintSession?.projection.dispose();clearHint('world changed');
            hintSession={world:pc.GetWorld(),projection:projection.create(pc,deps)};
        }
        const domain=hintSession.projection.resolve(pawn),repo=runtime.getCurrent()?.repo;
        const player=domain&&hintSession.projection.projectPlayer(pawn,domain);
        if(!domain||!player||player.heightComparable===false||!repo?.status().ready){clearHint('waiting for map');return;}
        const point=auto.chooseNearest(repo.snapshot(domain.allowedMapIDs).filter(accessory),player.location,null);
        if(!point){clearHint('no accessory nearby');return;}
        if(current?.key===point.key&&globalThis.__pbzCollectibleGuideStatus?.active)return;
        // hintOnly is set on the first event, so the navigation never takes ownership.
        if(current?.key===point.key)guide.stop('refresh accessory hint');
        toggle(pc,{...auto.targetOf(point,'manual'),hintOnly:true,__routeAccessoryHint:true},deps);
    }
    function mini(){
        const controller=globalThis.__pbzMinimapBootstrapV1,view=controller?.session;
        if(session===view)return;
        if(session){globalThis.PBZQuestRouteBridge?.removeMinimap?.(session.host);session=null;}
        if(!view?.host)return;
        session=view;
        const original=view.host.__pbzFrame,destroyed=view.host.__pbzDestroyed;
        view.host.__pbzFrame=function(...args){
            const result=original?.apply(this,args);
            if(controller.session!==view||!controller.status?.active||!view.visible)return result;
            try{
                const pawn=view.pc.K2_GetPawn(),player=view.domain&&view.projection.projectPlayer(pawn,view.domain);
                if(player)globalThis.PBZQuestRouteBridge?.paintMinimap?.(view,player,controller.status.rotation||0);
            }catch(e){log('[PBZQuestRoute] minimap adapter '+String(e));}
            return result;
        };
        view.host.__pbzDestroyed=function(...args){globalThis.PBZQuestRouteBridge?.removeMinimap?.(view.host);return destroyed?.apply(this,args);};
    }
    return {tick(){mini();hint();},load,api};
}
function install(){
    if(globalThis.__PBZQuestRouteTrackerAdapter)return globalThis.__PBZQuestRouteTrackerAdapter;
    const {Provider}=require('./PBZRouteProvider');
    const content=UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectContentDirectory());
    const provider=new Provider({load:require,dirname:__dirname,content,
        exists:file=>UE.BlueprintPathsLibrary.FileExists(file),runtime:()=>globalThis,clock:Date.now});
    const saved=UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectSavedDirectory()).replace(/[\\/]?$/,'/');
    const {LuaTracker}=require('./PBZRouteLuaTracker');
    const lua=new LuaTracker({read:()=>{
        const file=saved+'PBZQuestRoute-tracker.json',out=P.$ref('');
        return UE.BlueprintPathsLibrary.FileExists(file)&&UE.EasyCsv.LoadStringFromLocalFile(file,out)?String(P.$unref(out)):'';
    },write:text=>UE.EasyCsv.SaveStringToFileWithFullPath(text,saved+'PBZQuestRoute-command.json')});
    const control=globalThis.__PBZQuestRouteTrackerAdapter={state:null,error:'',timer:null};
    const tick=()=>{
        try{
            if(!control.state){
                if(lua.refresh()){
                    control.state={tick:()=>lua.refresh()};
                    globalThis.PBZMapTrackerBridge={target:lua};
                    const status=globalThis.__PBZQuestRouteRuntime;if(status)status.tracker='UE4SS Map Tracker 1.0.9 connected';
                    console.log('[PBZQuestRoute] UE4SS Map Tracker target adapter active');
                    return;
                }
                const active=provider.active();if(!active)return;
                control.state=adapt(active.load);
                globalThis.PBZMapTrackerBridge={load:active.load};
                const status=globalThis.__PBZQuestRouteRuntime;if(status)status.tracker='Map Tracker Plus connected';
                console.log('[PBZQuestRoute] official Map Tracker Plus adapter active');
            }
            control.state.tick();control.error='';
        }catch(e){const text=String(e);if(text!==control.error)console.error('[PBZQuestRoute compatibility] '+text);control.error=text;}
    };
    tick();control.timer=setInterval(tick,500);return control;
}
exports.install=install;
exports.adapt=adapt;
exports.isAccessory=accessory;
