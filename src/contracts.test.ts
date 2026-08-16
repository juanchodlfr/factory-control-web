import { describe,expect,it } from 'vitest'
import { boardResponse,summaryResponse } from './contracts'

describe('factory-control-read-v0.1.1 contracts',()=>{
 it('accepts documented summary shape',()=>{expect(summaryResponse.parse({status:'ok',contract_version:'factory-control-read-v0.1.1',summary:{active_agents:9,in_flight_work_items:4,pending_handoffs:3,blocked_work_items:1,waiting_for_juancho:2,derivation:{blocked:'payload.blocked === true',waiting_for_juancho:'payload.waiting_for_juancho === true'}},request_id:'r'}).summary.active_agents).toBe(9)})
 it('rejects undocumented board state',()=>{expect(()=>boardResponse.parse({status:'ok',contract_version:'factory-control-read-v0.1.1',agents:[],rows:[{work_item_id:'00000000-0000-4000-8000-000000000000',work_key:'X',title:'X',status:'OPEN',owner_agent_code:null,blocked:false,waiting_for_juancho:false,updated_at:null,cells:[{agent_code:'DEV',state:'mystery',latest_handoff_id:null,origin:false,destination:false}]}],request_id:'r'})).toThrow()})
})
