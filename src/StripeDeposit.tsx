import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { request } from './api';
import { s } from './styles';
import { Tap } from './Tap';

type Method = {providerCode:string;deposits:boolean;sandbox:boolean;currency:string;minAmount:number;maxAmount:number};
type Deposit = {id:string;providerCode:string;sandbox:boolean;amount:number;currency:string;status:string;redirectUrl:string|null;failureReason:string|null};
type Attempt = {requestId:string;amount:number;depositId?:string};
export function StripeDeposit({token,userId,onRefresh}:{token:string;userId:string;onRefresh:()=>void}) {
  const [method,setMethod]=useState<Method|null>(null),[amount,setAmount]=useState('25'),[attempt,setAttempt]=useState<Attempt|null>(null),[deposit,setDeposit]=useState<Deposit|null>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),alive=useRef(true),refresh=useRef(onRefresh);refresh.current=onRefresh;
  const key=`stripe-test-attempt-${userId}`;
  async function persist(value:Attempt|null){if(Platform.OS==='web'){if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);}else if(value)await SecureStore.setItemAsync(key,JSON.stringify(value));else await SecureStore.deleteItemAsync(key);}
  async function methods(){const data=await request<{methods:Method[]}>('/api/payments/methods',token);return data.methods.find(m=>m.providerCode==='STRIPE'&&m.deposits&&m.sandbox===true)||null;}
  function accept(next:Deposit){if(next.providerCode!=='STRIPE'||next.sandbox!==true)throw new Error('Live payments are disabled in this mobile integration.');if(alive.current){setDeposit(next);if(next.status==='SUCCEEDED')refresh.current();}}
  async function load(){setError('');try{const [m,stored]=await Promise.all([methods(),Platform.OS==='web'?Promise.resolve(localStorage.getItem(key)):SecureStore.getItemAsync(key)]);if(!alive.current)return;setMethod(m);const previous:Attempt|null=stored?JSON.parse(stored):null;setAttempt(previous);if(previous?.depositId)accept(await request<Deposit>(`/api/payments/deposits/${encodeURIComponent(previous.depositId)}`,token));setReady(true);}catch(e){if(alive.current)setError((e as Error).message);}}
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[userId,token]);
  async function check(){if(!deposit||lock.current)return;try{accept(await request<Deposit>(`/api/payments/deposits/${encodeURIComponent(deposit.id)}`,token));setError('');}catch(e){if(alive.current)setError((e as Error).message);}}
  useEffect(()=>{if(!deposit||deposit.status!=='PENDING')return;let cancelled=false,count=0;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{if(cancelled||count++>=40)return;await check();if(!cancelled)timer=setTimeout(poll,3000);};timer=setTimeout(poll,3000);return()=>{cancelled=true;clearTimeout(timer);};},[deposit?.id,deposit?.status]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active')void check();});return()=>sub.remove();},[deposit?.id]);
  async function create(){if(lock.current||!ready)return;lock.current=true;setBusy(true);setError('');try{
    const current=await methods();if(!current)throw new Error('Stripe test mode is not enabled on the backend.');setMethod(current);
    const value=attempt?.amount??Number(amount);
    if(!attempt&&(!/^\d+(\.\d{1,2})?$/.test(amount)||value<current.minAmount||value>current.maxAmount))throw new Error(`Enter ${current.minAmount}–${current.maxAmount} ${current.currency}, with at most two decimals.`);
    const nextAttempt=attempt||{requestId:randomUUID(),amount:value};await persist(nextAttempt);if(alive.current)setAttempt(nextAttempt);
    const next=await request<Deposit>('/api/payments/deposits',token,{providerCode:'STRIPE',amount:nextAttempt.amount,requestId:nextAttempt.requestId});
    const saved={...nextAttempt,depositId:next.id};await persist(saved);if(alive.current)setAttempt(saved);accept(next);
  }catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function open(){try{if(!deposit||deposit.sandbox!==true||deposit.status!=='PENDING'||!deposit.redirectUrl)throw new Error('No pending test checkout is available.');const url=new URL(deposit.redirectUrl);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||!url.pathname.startsWith('/c/pay/cs_test_'))throw new Error('Blocked: this is not a standard Stripe test Checkout URL.');await Linking.openURL(url.href);}catch(e){setError((e as Error).message);}}
  async function reset(){if(!deposit||deposit.status==='PENDING')return;try{await persist(null);setAttempt(null);setDeposit(null);setError('');}catch{setError('Cannot clear the completed attempt.');}}
  const button=(title:string,action:()=>void,disabled=false)=><Tap disabled={disabled} onPress={action} style={[s.button,disabled&&{opacity:.5}]}><Text style={s.buttonText}>{title}</Text></Tap>;
  return <View style={s.card}><Text style={s.title}>Load funds</Text><Text style={s.kicker}>STRIPE · TEST MODE ONLY</Text><Text style={s.small}>Use Stripe test payment details only. No live payments or withdrawals are enabled here.</Text>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!ready&&button('Reload payment options',load)}
    {ready&&!method&&<Text style={s.muted}>Stripe test deposits are not available. Enable the existing Stripe test gateway in the backend.</Text>}
    {method&&<><Text style={s.muted}>{method.minAmount}–{method.maxAmount} {method.currency}</Text><TextInput accessibilityLabel="Deposit amount" value={attempt?String(attempt.amount):amount} onChangeText={setAmount} editable={!busy&&!attempt} keyboardType="decimal-pad" style={s.input}/>{!deposit&&button(busy?'Preparing…':attempt?'Recover test deposit':'Create test checkout',create,busy||!ready)}</>}
    {attempt&&!deposit&&<Text style={s.small}>The amount is locked to this request. Recovery reuses the same ID to avoid a duplicate deposit.</Text>}
    {deposit&&<><Text accessibilityLiveRegion="polite" style={s.accent}>Deposit status: {deposit.status}</Text><Text style={s.muted}>{deposit.amount.toFixed(2)} {deposit.currency}</Text>{deposit.failureReason&&<Text style={s.error}>{deposit.failureReason}</Text>}{deposit.status==='PENDING'&&deposit.redirectUrl&&button('Open Stripe test checkout',open)}{button('Check payment status',check,busy)}{deposit.status!=='PENDING'&&button('New test deposit',reset)}<Text style={s.small}>After checkout, return to this app and check status. Closing checkout does not mean payment succeeded. Your backend alone confirms payment and updates the wallet.</Text></>}
  </View>;
}
