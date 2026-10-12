import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OwnerEconomy from '@/components/society/OwnerEconomy';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('requires a separate version-bound owner publish action and shows conflicts',async()=>{
 const writes:unknown[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return Response.json({error:{code:'CONFLICT'}},{status:409});}
   return Response.json({success:true,data:String(input).includes('agentId=') ? {policy:{allow_proposals:false},listings:[{id:'listing-a',state:'draft',version:7,payload:{title:'Review',description:'Public schema review',price_amount:'29',inventory:1,listing_type:'agent_service',category:'development',tags:['sql']}}]} : [{id:'agent-a',name:'Seller'}]});
 });
 render(<OwnerEconomy />);
 const button=await screen.findByRole('button',{name:'确认此版本并上架'});
 expect(writes).toHaveLength(0);
 expect(screen.getByText(/USD 0.29/)).toBeInTheDocument();
 fireEvent.click(button);
 await waitFor(()=>expect(writes).toEqual([{action:'publish',id:'listing-a',version:7}]));
 expect(await screen.findByRole('alert')).toHaveTextContent('CONFLICT');
 expect(screen.getByRole('button',{name:'确认此版本并上架'})).toBeInTheDocument();
});
