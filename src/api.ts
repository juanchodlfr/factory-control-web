import { createClient } from '@supabase/supabase-js'
import { agentsResponse, boardResponse, historyResponse, pipelineResponse, summaryResponse } from './contracts'
import { readAuthCallback } from './auth-callback'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
const supabaseUrl: string = url
const publishableKey: string = key
export const initialAuthCallback = typeof window === 'undefined' ? { kind: 'none' as const } : readAuthCallback(window.location)
export const supabase=createClient(supabaseUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})

async function read(path:string){
  const {data:{session}}=await supabase.auth.getSession()
  if(!session?.access_token) throw new Error('AUTH_REQUIRED')
  const res=await fetch(`${supabaseUrl}/functions/v1/factory${path}`,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:publishableKey}})
  if(!res.ok){const body=await res.json().catch(()=>({})); throw new Error(body?.code||`HTTP_${res.status}`)}
  return res.json()
}
export async function getSummary(){return summaryResponse.parse(await read('/summary'))}
export async function getBoard(){return boardResponse.parse(await read('/board'))}
export async function getAgents(){return agentsResponse.parse(await read('/agents'))}
export async function getPipeline(id:string){return pipelineResponse.parse(await read(`/work-items/${id}/pipeline`))}
export async function getHistory(id:string){return historyResponse.parse(await read(`/work-items/${id}/history`))}
