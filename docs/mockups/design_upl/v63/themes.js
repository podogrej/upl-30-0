// Палітри «в кольорах УПЛ» (docs/mockups/design_upl/README.md) поверх справжньої гри 0.63: міняються лише токени й кілька акцентів.
const GRAD='linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e)';
const tok=t=>`:root,:root[data-theme="dark"],:root[data-theme="light"]{${Object.entries(t).map(([k,v])=>`--${k}:${v}`).join(';')}}`;
module.exports={
 A:{name:'A · УПЛ класика (темна)',scheme:'dark',css:tok({bg:'#0b1430',bg2:'#0f1b3d',surface:'#132346',line:'#26396b',ink:'#ffffff',ink2:'#b9c2de',muted:'#7f8aad',amber:'#e0287a',amber2:'#ff831e',win:'#2fd07a',draw:'#f5b83d',loss:'#ff4d5e'})+
   `button.primary,.big0.primary{background:${GRAD};color:#fff;border:0}.logo0 span{background:${GRAD};-webkit-background-clip:text;background-clip:text;color:transparent}
    .pitch{background:radial-gradient(120% 80% at 50% 45%,#1a3a7a 0,#0e2350 70%)!important}.score0 b.hot,.fl5champ .ttl{background:${GRAD};-webkit-background-clip:text;background-clip:text;color:transparent}`},
 B:{name:'B · УПЛ світла',scheme:'light',css:tok({bg:'#f4f5fa',bg2:'#eceef6',surface:'#ffffff',line:'#dfe3ef',ink:'#132346',ink2:'#4a5578',muted:'#8a93b0',amber:'#6d2abb',amber2:'#d8177b',win:'#12a150',draw:'#c98a00',loss:'#e0263b'})+
   `button.primary,.big0.primary{background:${GRAD};color:#fff;border:0}.logo0 span{background:${GRAD};-webkit-background-clip:text;background-clip:text;color:transparent}
    .pitch{background:linear-gradient(#e9ecf5,#dde2ef)!important;color:#132346}.pitch .slot .nm{color:#132346!important;text-shadow:none!important}.pitch .slot .club{color:#4a5578!important}`},
 C:{name:'C · Матчдей',scheme:'dark',css:tok({bg:'#05070d',bg2:'#0a0d15',surface:'#0f131d',line:'#252c3c',ink:'#ffffff',ink2:'#aab3c5',muted:'#6c7488',amber:'#c8ff3d',amber2:'#ff2d78',win:'#c8ff3d',draw:'#ffd23d',loss:'#ff2d78'})+
   `button.primary,.big0.primary{background:#c8ff3d;color:#05070d;border:0}h1,h2,.logo0,.hero .tier{font-family:Oswald,Unbounded,sans-serif;text-transform:uppercase}
    .pitch{background:#0b1410!important}`},
 D:{name:'D · Мінімал 38-0',scheme:'light',css:tok({bg:'#ffffff',bg2:'#f4f4f6',surface:'#ffffff',line:'#e7e7ea',ink:'#0e1116',ink2:'#5b6070',muted:'#9aa0ab',amber:'#d41e6f',amber2:'#d41e6f',win:'#12a150',draw:'#b98000',loss:'#e0263b'})+
   `button.primary,.big0.primary{background:#132346;color:#fff;border:0}.logo0 span{color:#132346}
    .pitch{background:#eef0f3!important;color:#0e1116}.pitch .slot .nm{color:#0e1116!important;text-shadow:none!important}.pitch .slot .club{color:#5b6070!important}`}};
