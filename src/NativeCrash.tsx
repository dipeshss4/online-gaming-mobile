import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { Game, request } from './api';
import { s } from './styles';
import { Tap } from './Tap';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { LandscapeGame } from './LandscapeGame';

type Flight = { id:string; serverTime:string; startedAt:string; status:'FLYING'|'COLLECTED'|'CRASHED'; multiplier:number; tickets:{panel:number;stake:number;payout:number;collectedAt:number|null;status:string}[] };
type Attempt = {requestId:string;stakeOne:number;stakeTwo:number};
export function NativeCrash({game,token,userId,onClose,onSettled}:{game:Game;token:string;userId:string;onClose:()=>void;onSettled:()=>void}) {
  const [stakes,setStakes]=useState([String(game.minStake),'0']),[round,setRound]=useState<Flight|null>(null),[history,setHistory]=useState<Flight[]>([]);
  const [attempt,setAttempt]=useState<Attempt|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [win,setWin]=useState<Win|null>(null);
  const alive=useRef(true),lock=useRef(false),polling=useRef(false),version=useRef(0),callback=useRef(onSettled);callback.current=onSettled;
  const key=`crash-attempt-${userId}`;
  async function persist(a:Attempt|null){if(Platform.OS==='web'){if(a)localStorage.setItem(key,JSON.stringify(a));else localStorage.removeItem(key);}else if(a)await SecureStore.setItemAsync(key,JSON.stringify(a));else await SecureStore.deleteItemAsync(key);}
  function apply(next:Flight){if(!alive.current)return;setRound(next);setError('');setHistory(previous=>[next,...previous.filter(r=>r.id!==next.id)].slice(0,20));if(next.status!=='FLYING')callback.current();}
  async function restore(){setError('');try{const saved=Platform.OS==='web'?localStorage.getItem(key):await SecureStore.getItemAsync(key);const a:Attempt|null=saved?JSON.parse(saved):null;const flights=await request<Flight[]>('/api/crash',token);if(!alive.current)return;setAttempt(a);setHistory(flights);setRound(flights.find(f=>f.status==='FLYING')||flights[0]||null);setReady(true);}catch(e){if(alive.current)setError((e as Error).message);}}
  useEffect(()=>{alive.current=true;void restore();return()=>{alive.current=false;version.current++;};},[]);
  async function status(){if(!round||lock.current||polling.current)return;polling.current=true;const v=version.current;try{const next=await request<Flight>(`/api/crash/${encodeURIComponent(round.id)}`,token);if(v===version.current)apply(next);}catch{if(alive.current)setError('Connection interrupted. Display is last confirmed status; cash-out is not guaranteed. Retry status.');}finally{polling.current=false;}}
  useEffect(()=>{if(round?.status!=='FLYING')return;const timer=setInterval(()=>void status(),500);const listener=AppState.addEventListener('change',state=>{if(state==='active')void status();});return()=>{clearInterval(timer);listener.remove();};},[round?.id,round?.status]);
  async function launch(){if(lock.current||!ready||(!attempt&&round?.status==='FLYING'))return;const values=stakes.map(Number);if(!attempt&&(stakes.some(v=>!/^\d+(\.\d{1,2})?$/.test(v))||values.some(v=>v!==0&&v<game.minStake)||values[0]+values[1]<game.minStake||values[0]+values[1]>game.maxStake)){setError(`Use zero to disable a panel, otherwise at least ${game.minStake}. Combined maximum ${game.maxStake}.`);return;}
    lock.current=true;version.current++;setBusy(true);setError('');setWin(null);try{const a=attempt||{requestId:randomUUID(),stakeOne:values[0],stakeTwo:values[1]};await persist(a);if(alive.current)setAttempt(a);const next=await request<Flight>('/api/crash',token,a);await persist(null);if(alive.current){setAttempt(null);apply(next);callback.current();}}catch(e){if(alive.current)setError(`${(e as Error).message} Recovery keeps the same request ID and stakes.`);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function collect(panel:number){if(lock.current||round?.status!=='FLYING')return;lock.current=true;version.current++;setBusy(true);setError('');try{const next=await request<Flight>(`/api/crash/${encodeURIComponent(round.id)}/collect/${panel}`,token,{});apply(next);
    // Only a server-confirmed collection is celebrated; the displayed multiplier is never the authority.
    const paid=next.tickets.find(t=>t.panel===panel);
    if(paid&&paid.payout>0){feel('win');setWin({payout:paid.payout,stake:paid.stake,multiplier:Number((paid.payout/(paid.stake||1)).toFixed(2)),currency:'',id:`${next.id}-${panel}-${paid.payout}`});}
    callback.current();}catch{if(alive.current)setError('Cash-out confirmation unavailable. Check status or retry the same panel; only the server can confirm collection.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
  const button=(title:string,fn:()=>void,disabled=false)=><Tap onPress={fn} disabled={disabled} style={[s.button,disabled&&{opacity:.45}]}><Text style={s.buttonText}>{title}</Text></Tap>;
  return <LandscapeGame stage={0.62} stageItems={2}>
    <View style={c.topBar}><Tap disabled={busy} onPress={onClose}><Text style={s.link}>‹ Back to games</Text></Tap><Text numberOfLines={1} style={[s.title,{flex:1}]}>{game.name}</Text><Text numberOfLines={1} style={s.kicker}>SERVER CONTROLLED</Text></View>
    <LinearGradient colors={['#142535','#0c111e']} style={c.stage}><View style={c.grid}/><Text style={[c.plane,{color:round?.status==='CRASHED'?'#ca7a62':'#e3c58a'}]}>{round?.status==='CRASHED'?'✷':'✈'}</Text><Text accessibilityLiveRegion="polite" style={c.multiplier}>{(round?.multiplier??1).toFixed(2)}×</Text><Text style={s.accent}>{round?.status||'READY TO LAUNCH'}</Text><Text style={s.small}>Last server-confirmed multiplier</Text><WinCelebration win={win}/></LinearGradient>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!ready&&button('Reload flights',restore)}
    {attempt&&<Text style={s.muted}>Unresolved launch: {attempt.stakeOne.toFixed(2)} + {attempt.stakeTwo.toFixed(2)}. Recover before starting another flight.</Text>}
    {[0,1].map(index=>{const ticket=round?.tickets.find(t=>t.panel===index+1);return <View key={index} style={s.card}><Text style={s.kicker}>BET PANEL {index+1}</Text><TextInput accessibilityLabel={`Panel ${index+1} stake`} keyboardType="decimal-pad" value={attempt?String(index===0?attempt.stakeOne:attempt.stakeTwo):stakes[index]} editable={!busy&&!attempt&&round?.status!=='FLYING'} onChangeText={value=>setStakes(old=>old.map((v,i)=>i===index?value:v))} style={s.input}/>{ticket&&<Text style={s.muted}>{ticket.status} · Stake {ticket.stake.toFixed(2)} · Return {ticket.payout.toFixed(2)}</Text>}{button(`Cash out panel ${index+1}`,()=>void collect(index+1),busy||ticket?.status!=='OPEN'||round?.status!=='FLYING')}</View>;})}
    {button(busy?'Please wait…':attempt?'Recover flight':'Launch flight',launch,busy||!ready||(!attempt&&round?.status==='FLYING'))}{round&&button('Check flight status',status,busy)}
    <Text style={s.small}>Zero disables a panel. Launch debits both stakes. Cash-out depends on when the server receives your request, not the displayed multiplier. Leaving this screen does not stop the flight. No autoplay or automatic cash-out.</Text>
    <Text style={s.title}>Recent flights</Text>{history.map(f=><View key={f.id} style={s.row}><Text style={s.muted}>{new Date(f.startedAt).toLocaleTimeString()} · {f.status}</Text><Text style={s.accent}>{f.multiplier.toFixed(2)}×</Text></View>)}
  </LandscapeGame>;
}
const c=StyleSheet.create({topBar:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},stage:{height:240,borderWidth:1,borderColor:'#bfa06366',borderRadius:18,padding:24,justifyContent:'flex-end',gap:8,overflow:'hidden'},grid:{position:'absolute',left:24,right:24,top:30,bottom:24,borderLeftWidth:1,borderBottomWidth:1,borderColor:'#bdc6d522'},plane:{position:'absolute',right:35,top:25,fontSize:54,transform:[{rotate:'-20deg'}]},multiplier:{fontSize:56,fontWeight:'700',color:'#f1dfbc'}});
