import {NextRequest} from 'next/server';
import {POST} from '@/app/api/research/chat/route';
import {createClient} from '@/lib/supabase/server';
import OpenAI from 'openai';
jest.mock('@/lib/supabase/server',()=>({createClient:jest.fn()}));
jest.mock('openai',()=>({__esModule:true,default:jest.fn()}));
const request=(strict:boolean)=>new NextRequest('http://localhost/api/research/chat',{method:'POST',body:JSON.stringify({message:'Current news',requireCitations:strict})});
function setup(){const fallback=jest.fn(async()=>({choices:[{message:{content:'Uncited fallback'}}]}));const from=jest.fn();(createClient as jest.Mock).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'test'}}})},from});(OpenAI as unknown as jest.Mock).mockImplementation(()=>({responses:{create:jest.fn(async()=>{throw new Error('Search unavailable');})},chat:{completions:{create:fallback}}}));return {fallback,from};}
test('strict news never uses uncited completion fallback or saves an ungrounded session',async()=>{const x=setup();expect((await POST(request(true))).status).toBe(503);expect(x.fallback).not.toHaveBeenCalled();expect(x.from).not.toHaveBeenCalled();});
test('existing non-strict research retains its fallback behavior',async()=>{const x=setup();x.from.mockReturnValue({insert:()=>({select:()=>({single:async()=>({data:{id:'saved'}})})})});expect((await POST(request(false))).status).toBe(200);expect(x.fallback).toHaveBeenCalledTimes(1);});
