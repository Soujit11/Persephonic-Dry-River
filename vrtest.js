// Dry River emulator trial. Runs only when the page is opened with ?vrtest in the address:
// Meta's IWER emulator stands in for a Quest, and this script plays through the experience,
// listing each check on screen. It never runs for normal visitors.
import * as THREE from 'three';
const panel=document.createElement('pre');
panel.style.cssText='position:fixed;z-index:99;right:8px;top:8px;width:min(600px,48vw);max-height:94vh;overflow:auto;margin:0;padding:10px 12px;background:rgba(10,8,6,.88);color:#f6efe2;font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;border-radius:8px;pointer-events:none';
document.body.appendChild(panel);
const lines=[];let pass=0,fail=0;
const log=s=>{lines.push(s);panel.textContent=lines.join('\n');panel.scrollTop=1e9;console.log('[VRTEST] '+s)};
const check=(name,ok,detail='')=>{if(pausedNote)detail+=' [measured while throttled]';ok?pass++:fail++;log((ok?'PASS ':'FAIL ')+name+(detail?'  — '+detail:''))};
const errs=[];addEventListener('error',e=>{errs.push(e.message);log('ERROR '+e.message+' @'+(e.lineno||''))});
addEventListener('unhandledrejection',e=>{errs.push(String(e.reason?.message||e.reason));log('REJECT '+(e.reason?.message||e.reason))});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=8000,step=50)=>{const t0=performance.now();while(performance.now()-t0<ms){try{if(fn())return true}catch(e){}await wait(step)}return false};
const f2=v=>(+v).toFixed(2);
let pausedNote=false;
async function awake(){for(;;){const D=window.__dbg;if(!D)return;const f0=D.frameNo;await new Promise(r=>setTimeout(r,400));const fps=(D.frameNo-f0)/.4;
  if(fps>=30){if(pausedNote){log('info  page back to full speed, carrying on');pausedNote=false}return}
  if(!pausedNote){log('info  paused: the page is throttled ('+Math.round(fps)+' fps). Bring the browser pane to the front.');pausedNote=true}}}
window.__vrtest={lines,get result(){return {pass,fail,done:document.title.startsWith('VRTEST')}}};

(async()=>{
  log('Dry River emulator trial (Meta Quest 3 via IWER)');
  if(!await until(()=>window.__dbg&&window.xrDevice,15000)){log('FAIL page or emulator did not load');document.title='VRTEST 0/1';return}
  const D=window.__dbg,X=window.xrDevice,V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const vrBtn=document.getElementById('vr');
  if(vrBtn.disabled){vrBtn.disabled=false;vrBtn.textContent='Enter VR'}   // the emulator arrived after the page checked for VR
  X.position.set(0,1.6,0);X.quaternion.set(0,0,0,1);
  const R=X.controllers.right,Lc=X.controllers.left;
  const head=()=>D.head();
  const put=(c,w)=>{const b=D.toBase(w);c.position.set(b.x,b.y,b.z)};
  const aim=(c,fromW,toW)=>{put(c,fromW);const d=D.dirToBase(toW.clone().sub(fromW).normalize());const q=new THREE.Quaternion().setFromUnitVectors(V(0,0,-1),d);c.quaternion.set(q.x,q.y,q.z,q.w)};
  const hand=()=>head().p.clone().add(V(.2,-.45,0)),lhand=()=>head().p.clone().add(V(-.2,-.45,0));
  const tap=async(c,ms=120)=>{await awake();c.updateButtonValue('trigger',1);await wait(ms);c.updateButtonValue('trigger',0);await wait(120)};
  const park=()=>{const h=head().p;put(R,V(h.x+.25,1.1,h.z-.25));put(Lc,V(h.x-.25,1.1,h.z-.25));R.quaternion.set(0,0,0,1);Lc.quaternion.set(0,0,0,1)};
  const face=async target=>{const h=head(),to=target.clone().sub(h.p).setY(0).normalize(),cur=h.d.clone().setY(0).normalize();
    const ang=Math.atan2(-to.x,-to.z)-Math.atan2(-cur.x,-cur.z);const q=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),ang);
    const xq=new THREE.Quaternion(X.quaternion.x,X.quaternion.y,X.quaternion.z,X.quaternion.w).premultiply(q);X.quaternion.set(xq.x,xq.y,xq.z,xq.w);await wait(150)};
  const stepTo=async w=>{aim(Lc,lhand(),w);await wait(200);await tap(Lc);await wait(250);park()};   // the left hand moves you
  const goTo=async(w,tol=.35)=>{for(let k=0;k<8;k++){const h=head().p,d=Math.hypot(w.x-h.x,w.z-h.z);if(d<tol)return true;
      const s=Math.min(1,3.5/d);await stepTo(V(h.x+(w.x-h.x)*s,0,h.z+(w.z-h.z)*s));await wait(350)}const h=head().p;return Math.hypot(w.x-h.x,w.z-h.z)<tol};
  const fps=async()=>{const f0=D.frameNo;await wait(1000);return D.frameNo-f0};
  const touch=async(w,ms=150)=>{put(R,w);await wait(ms);await tap(R);await wait(150)};
  const holdTrig=async ms=>{await awake();R.updateButtonValue('trigger',1);await wait(ms);R.updateButtonValue('trigger',0);await wait(200)};
  const walkFor=async(ms,y=-1,x=0)=>{await awake();Lc.updateAxes('thumbstick',x,y);await wait(ms);Lc.updateAxes('thumbstick',0,0);await wait(500)};
  const local=w=>D.interior.worldToLocal(w.clone());
  log('info  frame rate '+(await fps())+' fps (keep this tab in front so it is not throttled)');
  park();vrBtn.click();
  check('session starts', await until(()=>D.renderer.xr.isPresenting,8000));
  await wait(700);
  check('controllers become touch points', await until(()=>D.tips>=2,3000), 'tips='+D.tips);
  check('guide speaks controller language', D.act()==='press the right trigger', D.act());

  // ---------- 1. the opening lesson, one control at a time ----------
  check('lesson 1: a welcome fades in', await until(()=>D.lastHint&&/Welcome/.test(D.lastHint[0]),6000), D.lastHint&&D.lastHint.join(' / '));
  check('the lesson waits on "look around" first', D.tutStep==='look', String(D.tutStep));
  check('lesson 2: how to step', await until(()=>D.tutStep==='step',8000), D.lastHint&&D.lastHint.join(' / '));
  {const bank=V(1.4,0,.7),flowersBefore=D.alive;aim(R,hand(),bank);await wait(250);R.updateButtonValue('trigger',1);await wait(1300);
   check('watering waits for its own lesson', !D.waterOn);R.updateButtonValue('trigger',0);await wait(400);
   {const q=head().p;check('the right trigger never steps you', Math.hypot(q.x-bank.x,q.z-bank.z)>.5, [q.x,q.z].map(f2))}
   check('the step lesson names the left hand', D.lastHint&&/left/.test(D.lastHint.join(' ')), D.lastHint&&D.lastHint.join(' / '));
   aim(Lc,lhand(),bank);await wait(250);await tap(Lc);await wait(300);
   const p=head().p;check('the left trigger steps you where it points', Math.hypot(p.x-bank.x,p.z-bank.z)<.15, [p.x,p.z].map(f2));
   park()}
  check('lesson 3: how to turn', await until(()=>D.tutStep==='turn',3000), String(D.tutStep));
  {const d0=head().d.clone();R.updateAxes('thumbstick',1,0);await wait(150);R.updateAxes('thumbstick',0,0);await wait(200);
   const d1=head().d,yaw=Math.atan2(d0.x*d1.z-d0.z*d1.x,d0.x*d1.x+d0.z*d1.z)*180/Math.PI;
   check('right stick turns 30°', Math.abs(yaw-30)<3, f2(yaw)+'°');
   R.updateAxes('thumbstick',-1,0);await wait(150);R.updateAxes('thumbstick',0,0);await wait(200)}
  check('lesson 4: how to walk', await until(()=>D.tutStep==='walk',3000), String(D.tutStep));
  {const w0=head().p.clone();Lc.updateAxes('thumbstick',0,1);await wait(1000);const vig=D.vigA;await wait(400);Lc.updateAxes('thumbstick',0,0);await wait(700);
   const w=Math.hypot(head().p.x-w0.x,head().p.z-w0.z);
   check('left stick walks', w>1&&w<2.4, f2(w)+' m in 1.4 s');check('edges darken while walking', vig>.3, f2(vig))}
  check('lesson 5: the river', await until(()=>D.tutStep==='river',3000), String(D.tutStep));
  await wait(1500);
  check('glow marks the riverbed', D.cueGlow.visible&&D.riverT(D.cueGlow.position.x,D.cueGlow.position.z)<1);
  {const h=head().p,bx=h.x,bed=V(bx,D.groundH(bx,D.riverZ(bx)),D.riverZ(bx));aim(R,hand(),bed);await wait(250);
   const ret=D.reticles.find(r=>r.visible);check('ring turns blue over the riverbed', ret&&ret.material.color.getHex()===0x8fd0ff);
   await tap(R);check('a press on the riverbed calls the water back', D.riverStarted>0&&D.rSources>0)}
  check('the river flows', await until(()=>D.riverFlow()>.5,10000), 'flow '+f2(D.riverFlow()));
  park();
  check('lesson 6: watering', await until(()=>D.tutStep==='water',3000), String(D.tutStep));
  {const hp=head().p,wilted=D.flowers.filter(f=>f.life<.3&&D.riverT(f.x,f.z)>1.1&&Math.hypot(f.x-hp.x,f.z-hp.z)<6&&Math.hypot(f.x-hp.x,f.z-hp.z)>1.2);
   check('found wilted flowers to water', wilted.length>0, wilted.length+' nearby');
   if(wilted.length){const f=wilted[0],l0=f.life,p0=head().p.clone();
     aim(R,hand(),V(f.x,D.groundH(f.x,f.z),f.z));await wait(200);
     R.updateButtonValue('trigger',1);const sawWater=await until(()=>D.waterOn,1500);await wait(2200);R.updateButtonValue('trigger',0);await wait(300);
     check('holding the trigger waters where you point', sawWater);
     check('the watered flower opens', f.life>l0+.5, f2(l0)+' -> '+f2(f.life));
     check('holding to water does not move you', head().p.distanceTo(p0)<.05);
     check('a fully opened flower stays open', await until(()=>f.full,3000))}
   park()}
  check('the lesson ends and the story guide takes over', await until(()=>D.tutStep===null,3000), String(D.tutStep));
  {const w2=D.flowers.filter(f=>f.life<.3&&!f.full);
   if(w2.length){const f=w2[Math.floor(w2.length/2)],l0=f.life;await stepTo(V(f.x+.6,0,f.z+.6));
     put(R,f.hp.clone());await wait(200);const l1=f.life;await wait(600);check('just touching a flower does nothing', f.life<=l1+.02);
     await holdTrig(1500);
     check('the trigger held at a flower waters it', f.life>l0+.4, f2(l0)+' -> '+f2(f.life));park()}}

  // ---------- 3b. the whole meadow is inside the valley and can be watered ----------
  {const dist=f=>Math.hypot(f.x+1,f.z+.5),far=D.flowers.reduce((a,f)=>dist(f)>dist(a)?f:a);
   check('every flower grows inside the valley', D.flowers.every(f=>D.inSite(f.x,f.z)), D.flowers.length+' flowers, farthest '+f2(dist(far))+' m of 10.5');
   check('the meadow reaches out toward the edge', D.flowers.filter(f=>dist(f)>8.5).length>10, D.flowers.filter(f=>dist(f)>8.5).length+' beyond 8.5 m');
   if(far.life<.9){const l0=far.life;await goTo(V(far.x-(far.x+1)*.18,0,far.z-(far.z+.5)*.18),.6);
     aim(R,hand(),V(far.x,D.groundH(far.x,far.z),far.z));await wait(200);await holdTrig(2400);
     check('the farthest flower can be watered', far.life>l0+.4, f2(l0)+' -> '+f2(far.life))}
   park()}

  // ---------- 4. the edge of the valley ----------
  {const h=head().p,o=V(h.x+1,0,h.z+.5);if(o.length()<.5)o.set(1,0,0);o.normalize();await face(V(-1+o.x*40,0,-.5+o.z*40))}await walkFor(9000);
  {const p=head().p;check('walking stops at the edge of the valley', D.inSite(p.x,p.z)&&Math.hypot(p.x+1,p.z+.5)>9.5, 'distance from centre '+f2(Math.hypot(p.x+1,p.z+.5))+' m');
   check('gentle edge hint', D.lastHint&&/valley ends/.test(D.lastHint[0]), D.lastHint&&D.lastHint[0]);
   const p0=p.clone(),out=V(p.x+2.5,0,p.z);await stepTo(out);
   {const q=head().p;check('cannot jump out of the valley', D.inSite(q.x,q.z), 'distance from centre '+f2(Math.hypot(q.x+1,q.z+.5))+' m')}}
  check('back from the edge', await goTo(V(-1.2,0,.8)), 'at '+[head().p.x,head().p.z].map(f2));await wait(500);

  // ---------- 5. the ruins and the rebuild ----------
  await goTo(D.H0.clone().add(V(2.5,0,-1.5)),.5);await face(D.H0);await walkFor(5000);
  {const p=head().p;check('cannot walk into the ruins', !D.houseBlocked(p.x,p.z), 'distance '+f2(Math.hypot(p.x-D.H0.x,p.z-D.H0.z)))}
  put(R,head().p.clone().add(V(.3,-1,0)));put(Lc,head().p.clone().add(V(-.3,-1,0)));await wait(1500);
  check('hands resting near the ruins do nothing now', D.houseP===0, 'houseP '+f2(D.houseP));
  aim(R,hand(),D.H0.clone().add(V(0,0,0)));await wait(200);await holdTrig(2500);
  check('pointing at the ruins with the trigger held rebuilds', D.houseP>.15, 'houseP '+f2(D.houseP));
  window.__dr.build();
  check('the house finishes', await until(()=>D.houseDone,15000));
  park();

  // ---------- 6. lantern, the closed door, walking in through the doorway ----------
  put(Lc,D.LANTERN.clone());await wait(300);Lc.updateButtonValue('trigger',1);await wait(150);Lc.updateButtonValue('trigger',0);await wait(400);
  check('the left hand cannot light the lantern', !D.lampLit);
  put(R,D.LANTERN.clone());await wait(600);check('within reach, the lantern glows softly', D.hoverName==='lantern', String(D.hoverName));
  check('reaching alone does not light it', !D.lampLit);
  await tap(R);check('the right trigger lights the lantern', await until(()=>D.lampLit,1500));park();await wait(900);
  const doorOut=D.L2W(-.48,0,2.9),doorIn=D.L2W(-.48,0,0);
  check('reach the front of the house', await goTo(doorOut,.4));await wait(500);await face(doorIn);await walkFor(4000);
  {const p=head().p;check('a closed door stops you walking in', !D.playerInside&&!D.houseBlocked(p.x,p.z))}
  {const p0=head().p.clone();await stepTo(doorIn);
   check('a closed door stops you jumping in', !D.playerInside&&head().p.distanceTo(p0)<.05);
   check('…with a gentle hint', D.lastHint&&/still closed/.test(D.lastHint[0]))}
  await wait(900);await touch(D.knobWorld().clone());check('the trigger at the handle opens the door', await until(()=>D.doorTarget>0,2000));park();await wait(2000);
  await goTo(doorOut,.4);await wait(400);await face(doorIn);await walkFor(4500);
  check('you can walk in through the open doorway', await until(()=>D.playerInside,1500), 'local '+local(head().p).toArray().map(f2));
  {await face(D.L2W(-5,0,0));await walkFor(5000);const l=local(head().p);
   check('inside, the walls stop you', Math.abs(l.x)<=1.36&&Math.abs(l.z)<=1.04, 'local '+[l.x,l.z].map(f2));
   await face(D.L2W(0,0,-5));await walkFor(5000);const l2=local(head().p);
   check('…on every side', Math.abs(l2.x)<=1.36&&Math.abs(l2.z)<=1.04, 'local '+[l2.x,l2.z].map(f2))}
  {await goTo(D.L2W(0,0,0),.5);await wait(900);const p0=head().p.clone();await stepTo(D.L2W(1.55,0,-1.25));const l=local(head().p);
   check('a jump near a wall lands clear of it', head().p.distanceTo(p0)>.5&&Math.abs(l.x)<=1.34&&Math.abs(l.z)<=1.02, 'local '+[l.x,l.z].map(f2))}

  // ---------- 7. fish food ----------
  await stepTo(D.L2W(.6,0,.4));await wait(400);
  await touch(D.FOOD.clone());check('the trigger at the tin picks it up', await until(()=>D.foodHeld,2000));
  check('…with a hint on how to put it down', D.lastHint&&/Press A/.test(D.lastHint[1]), D.lastHint&&D.lastHint.join(' / '));
  {const f0=D.flakesSprinkled,from=D.FOOD.clone(),to=D.BOWL.clone().add(V(0,.25,0));for(let k=1;k<=8;k++){put(R,from.clone().lerp(to,k/8));await wait(80)}await wait(300);const fz=D.flakesAlive;await wait(500);
   check('over the bowl, nothing falls until the trigger', D.flakesAlive===fz&&D.flakesSprinkled===f0);await holdTrig(1200);
   check('holding the trigger over the bowl sprinkles flakes', D.flakesSprinkled>f0, (D.flakesSprinkled-f0)+' flakes')}
  R.updateButtonValue('a-button',1);await wait(150);R.updateButtonValue('a-button',0);await wait(200);
  check('A puts the tin back', !D.foodHeld);park();await wait(1300);

  {const eye=D.L2W(.58,1.05,-.2),ray=new THREE.Raycaster(),meshes=[];let seen=0;D.interior.updateMatrixWorld(true);D.interior.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)});
   for(let r=0;r<2;r++)for(let k=0;k<5;k++){const tgt=D.L2W(.3+k*.13,.43+(r+1)*.42+.1,-1.08);ray.set(eye,tgt.clone().sub(eye).normalize());
     const hit=ray.intersectObjects(meshes,false)[0];if(hit&&D.books.includes(hit.object))seen++}
   check('the bookcase is open: books are what you see on the shelves', seen>=6, seen+' of 10 sight lines hit a book')}
  // ---------- 8. the cloth and the curtains ----------
  {const c0=JSON.stringify(D.curtainsOpen);await touch(D.HOOK.clone().add(V(0,-.2,0)));
   check('the trigger at the cloth picks it up', await until(()=>D.towelHeld==='vr',2000));
   {const from=D.HOOK.clone().add(V(0,-.2,0)),to=D.CURTAIN_PTS[0].clone();for(let k=1;k<=8;k++){put(R,from.clone().lerp(to,k/8));await wait(80)}}await wait(300);await tap(R);await wait(500);
   check('curtains ignore the hand holding the cloth', JSON.stringify(D.curtainsOpen)===c0);
   R.updateButtonValue('a-button',1);await wait(150);R.updateButtonValue('a-button',0);await wait(200);
   check('A hangs the cloth back up', D.towelHeld===null);park();await wait(1300);
   await wait(900);await touch(D.HOOK.clone().add(V(0,-.2,0)));await until(()=>D.towelHeld==='vr',2000);await wait(900);
   await touch(D.HOOK.clone().add(V(.1,-.05,0)));check('…or the trigger at the hook', await until(()=>D.towelHeld===null,2500));park();await wait(900);
   {const ok=[];for(const w of D.windows){await wait(900);await touch(D.HOOK.clone().add(V(0,-.2,0)));await until(()=>D.towelHeld==='vr',2000);
      const c=w.mesh.getWorldPosition(new THREE.Vector3()),n=V(0,0,1).applyQuaternion(w.mesh.getWorldQuaternion(new THREE.Quaternion())),from=D.HOOK.clone().add(V(0,-.2,0));
      const at=c.clone().addScaledVector(n,.22),d0=w.dirt;
      for(let k=1;k<=10;k++){put(R,from.clone().lerp(at,k/10));await wait(70)}
      for(let k=0;k<40;k++){put(R,at.clone().add(V(0,Math.sin(k*.7)*.25,0)).addScaledVector(V(-n.z,0,n.x),Math.cos(k*.5)*.25));await wait(60)}
      await wait(800);ok.push(w.dirt<d0-.1||w.clean);
      R.updateButtonValue('a-button',1);await wait(150);R.updateButtonValue('a-button',0);await wait(300)}
    check('the cloth wipes both windows from arm\'s length', ok.every(Boolean), ok.join(', '))}
   park();await wait(900);
   await touch(D.CURTAIN_PTS[0].clone());check('the trigger at a curtain draws it', await until(()=>JSON.stringify(D.curtainsOpen)!==c0,2000));park();await wait(1300)}

  // ---------- 8a. the bookshelf ----------
  check('the books start out of order', !D.booksTidy&&D.books.some(b=>b.userData.out>.2||Math.abs(b.userData.tilt)>.1));
  await touch(D.SHELF.clone());await wait(D.books.length*70+900);
  check('the trigger at the shelf puts the books in order', D.booksTidy&&D.books.every(b=>b.userData.out<.05&&Math.abs(b.userData.tilt)<.03));
  await wait(900);await touch(D.SHELF.clone());await wait(600);check('…then takes a book out to look at', D.books.some(b=>b.userData.target===1));
  park();await wait(900);

  // ---------- 8b. fire, kettle, tea ----------
  {const reach=D.FIRE.clone();put(R,reach);await wait(250);   // where a hand naturally reaches: the middle of the fireplace
   check('reaching into the fireplace highlights the fire or the kettle', /fire|kettle/.test(D.hoverName||''), D.hoverName||'nothing');
   await tap(R);await wait(150);check('the trigger in the fireplace lights the fire', await until(()=>D.fireLit,2000));park();await wait(900);
   put(R,D.FIRE_T.clone());await wait(250);check('the logs answer as the fire, not the kettle', D.hoverName==='fire', D.hoverName||'nothing');park();await wait(300)}
  await touch(D.KETTLE.clone());await until(()=>D.kettleState==='heating',2000);park();
  check('the kettle boils', await until(()=>D.kettleState==='boiled',12000), D.kettleState);await wait(1300);
  await touch(D.KETTLE.clone());check('the trigger lifts the kettle', await until(()=>D.kettleState==='carried',2000));
  await wait(2500);check('the kettle stays in your hand (no snapping back)', D.kettleState==='carried', D.kettleState);
  {const from=D.KETTLE.clone().add(V(0,.13,0)),to=D.CUP.clone().add(V(.05,.3,0));for(let k=1;k<=12;k++){put(R,from.clone().lerp(to,k/12));await wait(90)}}
  check('tip it over the cup to pour', await until(()=>D.cupFill>.3,6000), 'cup '+f2(D.cupFill));
  park();await until(()=>D.kettleState==='idle',6000);
  {const near=D.L2W(-.7,.55,-.25);put(R,near);await wait(200);await tap(R);await wait(300);   // the reach just after pouring, between the cup and the sofa
   check('a press by the tea table just after pouring does not sit you down', !D.seated);park();await wait(1700);
   put(R,near);await wait(200);await tap(R);await wait(300);
   check('the sofa no longer answers from the tea table', !D.seated, D.hoverName||'');park()}
  // ---------- 8b. pointing past the kettle at the back wall keeps you inside ----------
  {await goTo(D.L2W(.7,0,.55));await wait(300);
   const kettle=D.KETTLE.clone(),from=hand(),beyond=from.clone().add(kettle.clone().sub(from).multiplyScalar(2.2)).setY(0);
   {const p0=head().p.clone();aim(R,from,beyond);await wait(250);await tap(R);await wait(400);
    check('inside, the right trigger at the floor does not move you', head().p.distanceTo(p0)<.05)}
   aim(Lc,lhand(),beyond);await wait(250);await tap(Lc);await wait(400);park();
   const l=local(head().p);check('a step aimed through the back wall stops inside the room', D.inRoom(head().p)&&Math.abs(l.x)<=1.36&&Math.abs(l.z)<=1.04, 'local '+[l.x,l.z].map(f2));
   check('and you can still walk afterwards', await (async()=>{const p0=head().p.clone();await walkFor(700);return head().p.distanceTo(p0)>.2})())}
  // ---------- 8c. standing in the stone finds its way out ----------
  {const wall=D.L2W(0,1.6,-1.5),b0=X.position.clone(),b=D.toBase(wall);X.position.set(b.x,b.y,b.z);await wait(400);
   check('the head inside the back wall counts as stuck', D.houseBlocked(head().p.x,head().p.z));
   check('after a moment you are moved back into the room', await until(()=>!D.houseBlocked(head().p.x,head().p.z)&&D.inRoom(head().p),5000), 'local '+[local(head().p).x,local(head().p).z].map(f2));
   park();await wait(300)}

  // ---------- 9. sofa, cat ----------
  {const sofa=D.SOFA_SEAT.clone();await touch(sofa);check('the trigger at the seat sits you down', await until(()=>D.seated,2000));park();await wait(900);
   check('the seat stays inside the room', D.inRoom(head().p));
   Lc.updateAxes('thumbstick',0,-1);await wait(300);Lc.updateAxes('thumbstick',0,0);
   check('pushing the stick stands you up', await until(()=>!D.seated,1500));await wait(1200);
   check('standing up leaves you inside the room', D.inRoom(head().p));
   await touch(sofa);check('sit again', await until(()=>D.seated,2000));park();await wait(900);
   await awake();R.updateButtonValue('a-button',1);await wait(150);R.updateButtonValue('a-button',0);
   check('A stands you up too', await until(()=>!D.seated,1500));await wait(1200);
   await touch(sofa);await until(()=>D.seated,2000);park();await wait(900);
   await tap(Lc);check('the left trigger stands you up too', await until(()=>!D.seated,1500));await wait(1200);
   await touch(sofa);await until(()=>D.seated,2000);park();await wait(900);
   await touch(D.CAT.clone());park();await wait(900);await touch(sofa);check('the trigger at the seat again stands you up', await until(()=>!D.seated,2000));park()}
  {const fl=D.flowers.filter(f=>f.full).length;check('flowers outside are still open after the cat', fl>0&&D.flowers.filter(f=>f.full&&f.life<.97).length===0, fl+' open')}

  // ---------- 10. hands, quality, errors, exit ----------
  X.primaryInputMode='hand';await wait(700);
  check('hand tracking: fingertips become touch points', await until(()=>D.tips>=10,3000), 'tips='+D.tips);
  check('guide switches to pinch wording', D.act()==='pinch');
  {const [n1,n2,n3]=D.grassN;D.perfLevel=2;const low=D.grassCount;D.perfLevel=0;
   check('quality step-down thins far grass and restores it', low===n1+n3&&D.grassCount===n1+n2+n3)}
  check('no script errors', errs.length===0, errs.slice(0,3).join(' | '));
  await D.renderer.xr.getSession().end();await wait(500);
  check('session ends cleanly', !D.renderer.xr.isPresenting&&D.refM.equals(new THREE.Matrix4()));
  log('\nDONE  '+pass+' passed, '+fail+' failed');
  document.title='VRTEST '+pass+'/'+(pass+fail);
})().catch(e=>{log('FAIL trial crashed: '+(e?.stack||e));document.title='VRTEST crashed'});
