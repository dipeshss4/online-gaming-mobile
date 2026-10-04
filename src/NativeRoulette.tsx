import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { PendingBet, readPending, savePending, clearPending } from './pendingBet';
import { s } from './styles';
import { Tap } from './Tap';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { sound } from './sound';
import { GameShell, PayRow, Rules } from './GameShell';

const order = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
/** Chip values in the same colours as the website's table. */
const CHIP_COLORS = ['#3c7bff','#ff3cac','#8a3cff','#13a95a','#ff7a1a'];
const color = (n:number) => n===0?'#226548':red.has(n)?'#a73542':'#171820';
const outside = ['red','black','odd','even','low','high','dozen-1','dozen-2','dozen-3'];
const label = (key:string) => ({low:'1–18',high:'19–36','dozen-1':'1st 12','dozen-2':'2nd 12','dozen-3':'3rd 12'}[key] || key.replace('number-','').toUpperCase());
export function NativeRoulette({game,token,userId,initialBalance,onClose,onSettled}:{game:Game;token:string;userId:string;initialBalance:Balance|null;onClose:()=>void;onSettled:()=>void}) {
  // Ticket amounts are integer cents; only convert at the API boundary.
  const [ticket,setTicket]=useState<Record<string,number>>({}),[chip,setChip]=useState(Math.round(game.minStake*100));
  const [pending,setPending]=useState<PendingBet|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<PlayResult|null>(null),[wallet,setWallet]=useState(initialBalance),[reduced,setReduced]=useState(false);
  const [win,setWin]=useState<Win|null>(null);
  const locked=useRef(false),alive=useRef(true),rotation=useRef(new Animated.Value(0)).current;
  const total=Object.values(ticket).reduce((a,b)=>a+b,0);
  useEffect(()=>{alive.current=true;readPending(userId).then(p=>{if(alive.current){setPending(p);setReady(true);}}).catch(()=>setError('Cannot read saved bet. Play is locked.'));AccessibilityInfo.isReduceMotionEnabled().then(setReduced);const l=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive.current=false;l.remove();rotation.stopAnimation();};},[]);
  function add(key:string){if(busy||pending)return;sound.play('tap');setError('');setTicket(prev=>{const next=(prev[key]||0)+chip;const sum=Object.values(prev).reduce((a,b)=>a+b,0)+chip;if(next>Math.round(game.maxStake*100)||sum>Math.round(Math.min(game.maxStake,1000)*100)){setError('This ticket exceeds the game stake limit.');return prev;}return {...prev,[key]:next};});}
  async function spin(){
    if(locked.current||!ready||(pending&&pending.gameCode!==game.code))return;
    if(!pending&&(!total||total<game.minStake*100)){setError('Add at least one bet before spinning.');return;}
    if(!pending&&(!wallet||total>Math.round(wallet.balance*100))){setError('Insufficient available balance.');return;}
    locked.current=true;setBusy(true);setError('');setResult(null);setWin(null);
    let sent=false;
    try{
      const bet:PendingBet=pending||{gameCode:game.code,requestId:randomUUID(),stake:total/100,selections:Object.entries(ticket).sort(([a],[b])=>a.localeCompare(b)).map(([selection,cents])=>({selection,stake:cents/100}))};
      if(!bet.selections?.length)throw new Error('Saved request is not a roulette ticket. Reconcile it before playing.');
      await savePending(userId,bet);setPending(bet);sent=true;
      const data=await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`,token,{requestId:bet.requestId,stake:bet.stake,selections:bet.selections});
      const number=Number(data.symbols?.[0]);
      if(data.requestId!==bet.requestId||data.gameCode!==game.code||!Number.isInteger(number)||number<0||number>36)throw new Error('Unexpected server result. Recover this ticket.');
      if(!alive.current)return;
      rotation.setValue(0);sound.play('spin');
      await new Promise<void>(resolve=>Animated.timing(rotation,{toValue:1440+(360-order.indexOf(number)*360/37)%360,duration:reduced?0:2600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(()=>resolve()));
      if(!alive.current)return;
      await clearPending(userId);setPending(null);setResult(data);setWallet({...wallet,balance:data.balance,currency:data.currency});setTicket({});
      feel(data.payout>0?'win':'tap');sound.result(data.payout>0?data.multiplier:0);
      if(data.payout>0)setWin({payout:data.payout,stake:data.stake,multiplier:data.multiplier,currency:data.currency,id:data.betId});
      onSettled();
    }catch(e){if(!alive.current)return;if(!pending&&e instanceof ApiError&&[400,401,403,404,422,429].includes(e.status))await clearPending(userId).then(()=>setPending(null)).catch(()=>{});setError(`${e instanceof Error?e.message:'Unable to spin'}${sent?' Recover uses the same ticket ID, not a new bet.':''}`);onSettled();}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  // A table square: tap to add the chip. Its stake shows on it; the ticket is the squares with chips.
  const square=(key:string,w:number,h:number,text=label(key))=><Tap key={key} accessibilityRole="button" accessibilityLabel={`Bet ${label(key)}`} disabled={busy||!!pending} onPress={()=>add(key)}
    style={[r.square,{width:w,height:h,backgroundColor:key.startsWith('number-')?color(Number(key.slice(7))):'#144837'},!!ticket[key]&&r.squareOn]}>
    <Text style={[r.number,{fontSize:Math.max(11,Math.min(16,h*.38))}]} numberOfLines={1} adjustsFontSizeToFit>{text}</Text>
    {!!ticket[key]&&<View style={r.chipOn}><Text style={r.chipOnText}>{(ticket[key]/100).toFixed(ticket[key]%100?2:0)}</Text></View>}
  </Tap>;
  const chips=[...new Set([game.minStake,1,5,10,25])].filter(n=>n>=game.minStake&&n<=game.maxStake);
  const number=result?Number(result.symbols[0]):null;
  // On an upright phone the chips take the console's first row, so the table keeps the height.
  const window=useWindowDimensions(), upright=window.height>window.width&&window.width<600;
  const status=busy?'NO MORE BETS · WHEEL SPINNING':result?`${number} ${number===0?'GREEN':red.has(number!)?'RED':'BLACK'} · ${result.payout>0?`WIN ${result.payout.toFixed(2)}`:'NO WIN'}`:total?`TICKET ${(total/100).toFixed(2)} · ${Object.keys(ticket).length} BETS`:'TAP THE TABLE TO PLACE CHIPS';
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:pending&&!busy?`Pending ticket: ${pending.gameCode} · ${pending.stake.toFixed(2)}.${pending.gameCode!==game.code?' Open that game to recover it.':' SPIN resends this exact ticket.'}`:undefined}
    overlay={<><WinCelebration win={win}/><BigWin win={win}/></>}
    info={<>{game.engine?.paytable?.map((p,i)=><PayRow key={i} label={p.label} pays={`${p.multiplier}×`}/>)}<Text style={s.small}>One spin settles every chip together. Returns include stakes. Zero loses every outside bet.</Text><Rules rules={game.engine?.rules}/></>}
    controls={<>
      <View style={[r.chips, upright && { flexBasis: '100%', justifyContent: 'center', flexWrap: 'nowrap' }]} accessibilityLabel="Chip value">{chips.map((n,i)=><Tap key={n} accessibilityRole="button" accessibilityLabel={`Chip ${n}`} accessibilityState={{selected:chip===Math.round(n*100)}} disabled={busy||!!pending} onPress={()=>setChip(Math.round(n*100))}
        style={[r.chip,{backgroundColor:CHIP_COLORS[i%CHIP_COLORS.length]},chip===Math.round(n*100)&&r.chipSelected]}><Text style={r.chipText}>{n}</Text></Tap>)}</View>
      <Tap haptic="select" accessibilityLabel="Clear ticket" disabled={busy||!!pending||!total} onPress={()=>setTicket({})} style={[r.clear,(busy||!!pending||!total)&&{opacity:.45}]}><Text style={r.clearText}>CLEAR</Text></Tap>
      <View style={r.total}><Text style={r.totalLabel}>BET</Text><Text style={r.totalValue}>{(pending?.stake??total/100).toFixed(2)}</Text></View>
      <Tap haptic="heavy" accessibilityLabel={pending?'Recover ticket':'Spin'} disabled={busy||!ready||(!!pending&&pending.gameCode!==game.code)} onPress={spin} style={[r.spin,(busy||!ready)&&{opacity:.55}]}>
        <LinearGradient colors={['#ffe45c','#ff9f1a','#d1480f']} style={StyleSheet.absoluteFill}/><Text style={r.spinText}>{busy?'…':pending?'RECOVER':'SPIN'}</Text></Tap>
    </>}>
    {stage=>{
      // Sideways: the wheel beside a 3 by 12 table, as on a casino felt. Upright: the felt turns on its side (12 rows of
      // three) with the wheel and the even-money bets in a column beside it, so every square stays big enough to tap.
      const wide=stage.width>stage.height*1.15;
      const scale=(px:number)=>(px-6)/240;
      const wheelView=(px:number)=><View style={{width:px,height:px}}>
        <View style={{transform:[{scale:scale(px)}],width:240,height:240,marginLeft:(px-240)/2,marginTop:(px-240)/2}}>
          <Text style={r.pointer}>▼</Text>
          <Animated.View style={[r.wheel,{transform:[{rotate:rotation.interpolate({inputRange:[0,1800],outputRange:['0deg','1800deg']})}]}]}>{order.map((n,i)=>{const angle=i*2*Math.PI/37;return <View key={n} style={[r.pocket,{left:116+104*Math.sin(angle)-9,top:116-104*Math.cos(angle)-12,backgroundColor:color(n),transform:[{rotate:`${i*360/37}deg`}]}]}><Text style={{color:'#fff',fontSize:11,fontWeight:'700'}}>{n}</Text></View>;})}<View style={r.hub}><Text style={{color:'#e7c888',fontSize:42}}>✦</Text></View></Animated.View>
        </View>
        {number!==null&&!busy&&<View style={[r.result,{backgroundColor:color(number)}]}><Text style={r.resultText}>{number}</Text></View>}
      </View>;
      if(wide){
        const wheel=Math.floor(Math.min(stage.height-16,stage.width*.32))-6;
        const tableW=stage.width-wheel-28;
        // 13.2 cells across (zero is 1.2), 13 gaps of 2px and the table's 4px padding and 2px border on each side.
        const cellW=Math.floor((tableW-12-26-8)/13.2), cellH=Math.floor(Math.min(cellW*1.25,(stage.height-24)/5));
        return <View style={r.layout}>
          {wheelView(wheel)}
          <View style={r.table}>
            <View style={{flexDirection:'row',gap:2}}>
              {square('number-0',Math.floor(cellW*1.2),cellH*3+4)}
              <View style={{gap:2}}>{[3,2,1].map(row=><View key={row} style={{flexDirection:'row',gap:2}}>{Array.from({length:12},(_,col)=>square(`number-${col*3+row}`,cellW,cellH))}</View>)}</View>
            </View>
            <View style={{flexDirection:'row',gap:2,marginLeft:Math.floor(cellW*1.2)+2}}>{['dozen-1','dozen-2','dozen-3'].map(k=>square(k,cellW*4+6,Math.floor(cellH*.9)))}</View>
            <View style={{flexDirection:'row',gap:2,marginLeft:Math.floor(cellW*1.2)+2}}>{['low','even','red','black','odd','high'].map(k=>square(k,cellW*2+2,Math.floor(cellH*.9)))}</View>
          </View>
        </View>;
      }
      // Upright: twelve rows of three down the stage's height.
      const side=Math.floor(Math.min(130,stage.width*.32)), cellH=Math.floor((stage.height-24)/12);
      const cellW=Math.floor((stage.width-side-24-12-6)/3.6);
      return <View style={[r.layout,{alignItems:'flex-start'}]}>
        <View style={r.table}>
          <View style={{flexDirection:'row',gap:2}}>
            <View style={{gap:1}}>
              {Array.from({length:12},(_,row)=><View key={row} style={{flexDirection:'row',gap:1}}>{[1,2,3].map(col=>square(`number-${row*3+col}`,cellW,cellH))}</View>)}
            </View>
            <View style={{gap:2}}>{['dozen-1','dozen-2','dozen-3'].map(k=>square(k,Math.floor(cellW*.6),cellH*4+3,['1st','2nd','3rd'][Number(k.slice(6))-1]))}</View>
          </View>
        </View>
        <View style={{width:side,gap:4,alignItems:'center'}}>
          {wheelView(side)}
          {/* Zero sits with the wheel, so the twelve rows of the felt get the whole height. */}
          {square('number-0',side,Math.max(44,cellH))}
          {['low','even','red','black','odd','high'].map(k=>square(k,side,Math.max(40,Math.floor(cellH*.9))))}
        </View>
      </View>;
    }}
  </GameShell>;
}
const r=StyleSheet.create({
  layout:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},
  wheel:{width:240,height:240,borderWidth:2,borderColor:'#e7c888',borderRadius:120,backgroundColor:'#39291d'},
  pocket:{position:'absolute',width:18,height:24,alignItems:'center',justifyContent:'center'},
  hub:{position:'absolute',left:60,top:60,width:116,height:116,borderRadius:60,borderWidth:3,borderColor:'#bd9253',alignItems:'center',justifyContent:'center',backgroundColor:'#6b4825'},
  pointer:{position:'absolute',top:-14,alignSelf:'center',color:'#ffe3a1',fontSize:20,zIndex:2},
  result:{position:'absolute',bottom:0,right:0,minWidth:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:'#ffe45c'},
  resultText:{color:'#fff',fontWeight:'900',fontSize:20},
  table:{padding:4,gap:2,borderRadius:12,borderWidth:2,borderColor:'#e7c888',backgroundColor:'#103629'},
  square:{borderWidth:1,borderColor:'#e7c88866',alignItems:'center',justifyContent:'center',borderRadius:3},
  squareOn:{borderColor:'#ffe45c',borderWidth:2},
  number:{color:'#fff1d5',fontWeight:'800'},
  chipOn:{position:'absolute',minWidth:24,height:24,paddingHorizontal:3,borderRadius:12,backgroundColor:'#ffd23f',borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
  chipOnText:{color:'#3b1600',fontWeight:'900',fontSize:11},
  chips:{flexDirection:'row',gap:6,flex:1,flexWrap:'wrap'},
  chip:{width:46,height:46,borderRadius:23,borderWidth:3,borderStyle:'dashed',borderColor:'#ffffffaa',alignItems:'center',justifyContent:'center'},
  chipSelected:{borderColor:'#ffd23f',borderStyle:'solid',transform:[{scale:1.1}]},
  chipText:{color:'#fff',fontWeight:'900',fontSize:14},
  clear:{minHeight:44,paddingHorizontal:12,borderRadius:12,borderWidth:1.5,borderColor:'#e7c888',alignItems:'center',justifyContent:'center'},
  clearText:{color:'#ffe3a1',fontWeight:'900',fontSize:12,letterSpacing:1},
  total:{alignItems:'center',minWidth:70},
  totalLabel:{color:'#ff9a6a',fontSize:11,fontWeight:'900',letterSpacing:2},
  totalValue:{color:'#ffe45c',fontSize:20,fontWeight:'900'},
  spin:{width:72,height:72,borderRadius:36,overflow:'hidden',alignItems:'center',justifyContent:'center',borderWidth:4,borderColor:'#ffe45c'},
  spinText:{color:'#3b1600',fontWeight:'900',fontSize:18},
});
