export const $ = (id)=>document.getElementById(id);
export const on = (el,ev,cb)=>el&&el.addEventListener(ev,cb);
export const dpr = window.devicePixelRatio||1;
export const fmt = {
  m:(v)=>(v??0).toFixed(3)+' м',
  min:(v)=>(v??0).toFixed(2)+' мин',
  rub:(v)=>(v??0).toFixed(2)+' ₽',
  pct:(v)=>(v??0).toFixed(1)+'%'
};
export const setStatus = (msg,type='warn')=>{
  const el=$('status'); el.hidden=false; el.className='status '+type; el.textContent=msg;
  console.log('[status]', msg);
};
export const near = (a,b,eps)=>Math.abs(a-b)<=eps;
export const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
export function screenToWorld(state, canvas, clientX, clientY){
  const rect=canvas.getBoundingClientRect();
  const mx=(clientX-rect.left)*dpr, my=(clientY-rect.top)*dpr;
  const x=(mx-state.pan.x)/(state.zoom*dpr);
  const y=(canvas.height-my-state.pan.y)/(state.zoom*dpr);
  return {x,y,sx:mx,sy:my};
}
