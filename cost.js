export const CUT = {
  0.5:{max:{oxygen:6,nitrogen:3,air:4},spd:{oxygen:1000,nitrogen:1200,air:800},pierce:{oxygen:2.0,nitrogen:1.5,air:2.5}},
  1.0:{max:{oxygen:10,nitrogen:6,air:8},spd:{oxygen:2000,nitrogen:2500,air:1500},pierce:{oxygen:1.5,nitrogen:1.0,air:2.0}},
  1.5:{max:{oxygen:15,nitrogen:10,air:12},spd:{oxygen:3000,nitrogen:3500,air:2200},pierce:{oxygen:1.2,nitrogen:0.8,air:1.5}},
  2.0:{max:{oxygen:25,nitrogen:20,air:18},spd:{oxygen:4000,nitrogen:4500,air:3000},pierce:{oxygen:1.0,nitrogen:0.6,air:1.2}}
};
export function calcCutParams(power, th, gas){
  const P = CUT[power]; if(!P) return {can:false, reason:"Нет данных по мощности"};
  const max = P.max[gas]; if(th>max) return {can:false, reason:`Недостаточная мощность для ${th} мм (${gas})`};
  const base = P.spd[gas];
  const speed = Math.max(Math.round(base * Math.pow(1 - (th/(max*1.5)),0.6)),100);
  const pierce = P.pierce[gas]*(1+(th/max)*2);
  const gasCons = (th/3)*(gas==='nitrogen'?4.0:gas==='oxygen'?2.0:1.0);
  return {can:true, speed, pierce, gasCons};
}
