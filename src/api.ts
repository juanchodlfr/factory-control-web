import { createClient } from '@supabase/supabase-js'
import { agentsResponse, boardResponse, historyResponse, pipelineResponse, summaryResponse } from './contracts'

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined
if(!url||!key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})

async function read(path:string){
  const {data:{session}}=await supabase.auth.getSession()
  if(!session?.access_token) throw new Error('AUTH_REQUIRED')
  const res=await fetch(`${url}/functions/v1/factory${path}`,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:key}})
  if(!res.ok){const body=await res.json().catch(()=>({})); throw new Error(body?.code||`HTTP_${res.status}`)}
  return res.json()
}
export async function getSummary(){return summaryResponse.parse(await read('/summary'))}
export async function getBoard(){return boardResponse.parse(await read('/board'))}
export async function getAgents(){return agentsResponse.parse(await read('/agents'))}
export async function getPipeline(id:string){return pipelineResponse.parse(await read(`/work-items/${id}/pipeline`))}
export async function getHistory(id:string){return historyResponse.parse(await read(`/work-items/${id}/history`))}
