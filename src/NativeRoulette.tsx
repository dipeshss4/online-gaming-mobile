import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { PendingBet, readPending, savePending, clearPending } from './pendingBet';
import { s } from './styles';
import { Tap } from './Tap';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { LandscapeGame } from './LandscapeGame';
import { GameHistory } from './GameHistory';

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
  const [win,setWin]=useState<Win|null>(null),[played,setPlayed]=useState(0);
  const locked=useRef(false),alive=useRef(true),rotation=useRef(new Animated.Value(0)).current;
  const total=Object.values(ticket).reduce((a,b)=>a+b,0);
  useEffect(()=>{alive.current=true;readPending(userId).then(p=>{if(alive.current){setPending(p);setReady(true);}}).catch(()=>setError('Cannot read saved bet. Play is locked.'));AccessibilityInfo.isReduceMotionEnabled().then(setReduced);const l=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive.current=false;l.remove();rotation.stopAnimation();};},[]);
  function add(key:string){if(busy||pending)return;setError('');setTicket(prev=>{const next=(prev[key]||0)+chip;const sum=Object.values(prev).reduce((a,b)=>a+b,0)+chip;if(next>Math.round(game.maxStake*100)||sum>Math.round(Math.min(game.maxStake,1000)*100)){setError('This ticket exceeds the game stake limit.');return prev;}return {...prev,[key]:next};});}
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
      rotation.setValue(0);
      await new Promise<void>(resolve=>Animated.timing(rotation,{toValue:1440+(360-order.indexOf(number)*360/37)%360,duration:reduced?0:2600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(()=>resolve()));
      if(!alive.current)return;
      await clearPending(userId);setPending(null);setResult(data);setWallet({...wallet,balance:data.balance,currency:data.currency});setTicket({});
      feel(data.payout>0?'win':'tap');
      if(data.payout>0)setWin({payout:data.payout,stake:data.stake,multiplier:data.multiplier,currency:data.currency,id:data.betId});
      setPlayed(n=>n+1);onSettled();
    }catch(e){if(!alive.current)return;if(!pending&&e instanceof ApiError&&[400,401,403,404,422,429].includes(e.status))await clearPending(userId).then(()=>setPending(null)).catch(()=>{});setError(`${e instanceof Error?e.message:'Unable to spin'}${sent?' Recover uses the same ticket ID, not a new bet.':''}`);setPlayed(n=>n+1);onSettled();}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  const button=(key:string)=><Tap key={key} accessibilityRole="button" accessibilityLabel={`Bet ${label(key)}`} disabled={busy||!!pending} onPress={()=>add(key)} style={[r.square,{backgroundColor:key.startsWith('number-')?color(Number(key.slice(7))):'#144837'},!!ticket[key]&&{borderColor:'#ffe3a1',borderWidth:2}]}><Text style={r.number}>{label(key)}</Text>{!!ticket[key]&&<Text style={r.chipValue}>{(ticket[key]/100).toFixed(2)}</Text>}</Tap>;
  // The betting table is the game here, so the controls side keeps more room than a slot cabinet needs.
  return <LandscapeGame stage={0.52} stageItems={2} below={<GameHistory token={token} game={game} refresh={played}/>}>
    {/* One header row: the wheel needs the height that three stacked lines were taking. */}
    <View style={r.topBar}><Tap disabled={busy} onPress={onClose}><Text style={s.link}>‹ Back to games</Text></Tap><Text numberOfLines={1} style={[s.title,{flex:1}]}>{game.name}</Text><Text numberOfLines={1} style={s.kicker}>SINGLE ZERO</Text></View>
    <LinearGradient colors={['#3a0f5e','#12062b']} style={r.cabinet}><Text style={r.pointer}>▼</Text><Animated.View style={[r.wheel,{transform:[{rotate:rotation.interpolate({inputRange:[0,1800],outputRange:['0deg','1800deg']})}]}]}>{order.map((n,i)=>{const angle=i*2*Math.PI/37;return <View key={n} style={[r.pocket,{left:118+108*Math.sin(angle)-9,top:118-108*Math.cos(angle)-12,backgroundColor:color(n),transform:[{rotate:`${i*360/37}deg`}]}]}><Text style={{color:'#fff',fontSize:9}}>{n}</Text></View>;})}<View style={r.hub}><Text style={{color:'#e7c888',fontSize:42}}>✦</Text></View></Animated.View><Text accessibilityLiveRegion="polite" style={[s.title,{textAlign:'center'}]}>{busy?'Wheel in motion…':result?`Result: ${result.symbols[0]} ${result.symbols[1]}`:'Place your chips'}</Text><WinCelebration win={win}/></LinearGradient>
    <View style={s.card}><Text style={s.accent}>Balance {wallet?.balance.toFixed(2)??'—'} {wallet?.currency}</Text><Text style={s.muted}>Total bet {(pending?.stake??total/100).toFixed(2)}</Text>{result&&<Text accessibilityLiveRegion="polite" style={s.accent}>Return {result.payout.toFixed(2)} · Net {(result.payout-result.stake).toFixed(2)}</Text>}</View>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{pending&&!busy&&<Text style={s.muted}>Pending ticket: {pending.gameCode} · {pending.stake.toFixed(2)}{pending.gameCode!==game.code?' — open that game to recover.':''}</Text>}
    <Text style={s.kicker}>CHIP VALUE · TAP A SELECTION TO ADD</Text><View style={r.chips}>{[...new Set([game.minStake,1,5,10,25])].filter(n=>n>=game.minStake&&n<=game.maxStake).map((n,i)=><Tap key={n} accessibilityRole="button" accessibilityLabel={`Chip ${n}`} disabled={busy||!!pending} onPress={()=>setChip(Math.round(n*100))} style={[r.chip,{backgroundColor:CHIP_COLORS[i%CHIP_COLORS.length]},chip===Math.round(n*100)&&{borderColor:'#ffd23f',borderWidth:3}]}><Text style={s.accent}>{n}</Text></Tap>)}</View>
    <View style={r.table}>{button('number-0')}<View style={r.grid}>{Array.from({length:36},(_,i)=>button(`number-${i+1}`))}</View><View style={r.grid}>{outside.map(button)}</View></View>
    <Text style={s.kicker}>YOUR TICKET</Text>{Object.entries(ticket).map(([key,cents])=><Tap key={key} accessibilityRole="button" accessibilityLabel={`Remove ${label(key)}`} disabled={busy||!!pending} onPress={()=>setTicket(prev=>Object.fromEntries(Object.entries(prev).filter(([k])=>k!==key)))}><Text style={s.muted}>{label(key)} · {(cents/100).toFixed(2)}    × Remove</Text></Tap>)}
    <Tap disabled={busy||!!pending} onPress={()=>setTicket({})}><Text style={s.link}>Clear ticket</Text></Tap><Tap disabled={busy||!ready||(!!pending&&pending.gameCode!==game.code)} onPress={spin} style={[s.button,(busy||!ready)&&{opacity:.5}]}><Text style={s.buttonText}>{busy?'Spinning…':pending?'Recover ticket':'SPIN ROULETTE'}</Text></Tap>
    <Text style={s.small}>One spin settles every selection together. Returns include stakes. Zero loses all outside bets. No autoplay.</Text>{game.engine?.paytable?.map((p,i)=><Text key={i} style={s.muted}>{p.label}: {p.multiplier}×</Text>)}
  </LandscapeGame>;
}
const r=StyleSheet.create({topBar:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},cabinet:{borderWidth:1.5,borderColor:'#ff9ad6',borderRadius:18,padding:16,gap:12,alignItems:'center'},wheel:{width:240,height:240,borderWidth:2,borderColor:'#e7c888',borderRadius:120,backgroundColor:'#39291d'},pocket:{position:'absolute',width:18,height:24,alignItems:'center',justifyContent:'center'},hub:{position:'absolute',left:60,top:60,width:116,height:116,borderRadius:60,borderWidth:3,borderColor:'#bd9253',alignItems:'center',justifyContent:'center',backgroundColor:'#6b4825'},pointer:{color:'#ffe3a1',fontSize:20,marginBottom:-14,zIndex:2},chips:{flexDirection:'row',gap:12,flexWrap:'wrap'},chip:{width:48,height:48,borderRadius:24,borderWidth:2,borderStyle:'dashed',borderColor:'#ffffffaa',alignItems:'center',justifyContent:'center'},table:{backgroundColor:'#103629',padding:10,borderWidth:1,borderColor:'#b99a61',borderRadius:14,gap:8},grid:{flexDirection:'row',flexWrap:'wrap',gap:5},square:{width:'31%',flexGrow:1,minHeight:48,borderWidth:1,borderColor:'#bfa77766',alignItems:'center',justifyContent:'center',borderRadius:4},number:{color:'#fff1d5',fontSize:14,fontWeight:'700'},chipValue:{color:'#fff',fontSize:12,fontWeight:'800'}});
