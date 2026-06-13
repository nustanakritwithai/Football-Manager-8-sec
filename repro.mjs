const BASE=new URL('./src',import.meta.url).pathname;
const {createInitialState}=await import(`${BASE}/state.js`);
const {startSimulation,simTick}=await import(`${BASE}/simulation.js`);
const {analyze}=await import(`${BASE}/tacticalAnalyzer.js`);
const {getPlayer}=await import(`${BASE}/team.js`);
let worst=0,info=null,g=0,M=150,empty=0,tot=0,defStreak=0;
for(let m=0;m<M;m++){
  const s=createInitialState('4-2-3-1');s.tacticalScores=analyze(s).scores;let str=0;
  while(s.phase!=='finished'){
    startSimulation(s);let lbx=s.ball.x,lby=s.ball.y,stat=0,done=false,n=0;
    while(!done){done=simTick(s);if(++n>200)break;const b=s.ball;const mv=Math.hypot(b.x-lbx,b.y-lby);
      if(mv<0.05){stat++;if(stat>worst){worst=stat;const o=b.ownerPlayerId?getPlayer(s,b.ownerPlayerId):null;info={role:o?.role,act:o?.currentAction,loose:b.isLoose};}}else stat=0;lbx=b.x;lby=b.y;}
    tot++;const ev=s.history.at(-1).events;if(ev.filter(e=>!e.startsWith('Objective:')).length===0)empty++;
    if(s.teamPhases.home==='DEFENDING'){str++;defStreak=Math.max(defStreak,str);}else str=0;
  }
  g+=s.score.home+s.score.away;
}
console.log('worst static run',worst,'ticks',JSON.stringify(info));
console.log('empty turns',(empty/tot*100).toFixed(1)+'% | DEF streak',defStreak,'| goals/game',(g/M).toFixed(2));
