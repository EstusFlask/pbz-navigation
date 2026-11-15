'use strict';
// Resolve the real tracker's composed item keys back to directed capture cards.
class SurveyTracker{
 constructor(tasks){this.tasks=new Map(tasks.map(task=>[task.id.toLowerCase(),task]));}
 match(key){
  const found=String(key||'').toLowerCase().match(/(?:^|:)pbz-survey:([a-z0-9_-]+):(start|end)$/);
  if(!found)return null;const task=this.tasks.get(found[1]);if(!task)return null;
  return {task,role:found[2],endpoint:task[found[2]]};
 }
}
exports.SurveyTracker=SurveyTracker;
