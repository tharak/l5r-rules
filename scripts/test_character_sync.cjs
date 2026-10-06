const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname,'../character-storage.js'),'utf8');
const item = (id,name = id) => ({id,sheet:{name},updatedAt:'2026-10-06T15:00:00.000Z'});
function device(storage = new Map()) {
  const listeners = {};
  const window = {addEventListener:(name,fn) => listeners[name] = fn,dispatchEvent(){}};
  vm.runInNewContext(source,{window,Event,crypto:{randomUUID},console:{error(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>1,clearTimeout(){}});
  let receive, fail;
  const api = window.CharacterStorage;
  const connect = (uid,write = async()=>{}) => api.connect(uid,(next,error)=>{receive=next;fail=error;return ()=>{};},write);
  return {api,storage,connect,receive:(...args)=>receive(...args),fail:error=>fail(error),records:()=>JSON.parse(JSON.stringify(api.records()))};
}
test('device import is explicit, repeatable, and isolated across accounts', async () => {
  const d = device(); d.api.save([item('guest')]);
  d.connect('alice'); d.receive([]); assert.deepEqual(d.records(),[]);
  assert.equal(d.api.importDevice(),1); assert.equal(d.api.importDevice(),0);
  d.connect('bob'); d.receive([]); assert.deepEqual(d.records(),[]);
  d.api.connect(null); assert.deepEqual(d.records(),[item('guest')]);
  d.connect('alice'); d.receive([]); assert.deepEqual(d.records(),[item('guest')]);
});
test('failed writes survive reload and upload after reconnect', async () => {
  const d = device(); d.connect('alice',async()=>{throw new Error('offline');}); d.receive([]);
  d.api.save([item('one')]); await d.api.flush();
  assert.match(d.api.status,/unavailable/);
  const uploads = [], reloaded = device(d.storage);
  reloaded.connect('alice',async(id,record)=>uploads.push({id,record:JSON.parse(JSON.stringify(record))}));
  reloaded.receive([]); await reloaded.api.flush();
  assert.deepEqual(uploads,[{id:'one',record:item('one')}]);
  assert.equal(reloaded.api.status,'Saved to your account');
});
test('offline deletion cannot be resurrected by a server snapshot or reload', async () => {
  const d = device(); d.connect('alice'); d.receive([item('one')]); d.api.save([]);
  d.receive([item('one')]); assert.deepEqual(d.records(),[]);
  const writes=[], reloaded=device(d.storage);
  reloaded.connect('alice',async(id,record)=>writes.push([id,record]));
  reloaded.receive([item('one')]); await reloaded.api.flush();
  assert.deepEqual(writes,[['one',null]]); assert.deepEqual(reloaded.records(),[]);
});
test('remote changes update the roster while newer local edits remain pending', async () => {
  const d=device(); d.connect('alice'); d.receive([item('one'),item('two')]);
  d.api.save([item('one','local edit'),item('two')]);
  d.receive([item('one','remote edit'),item('three')]);
  assert.deepEqual(d.records(),[item('one','local edit'),item('three')]);
});
test('an edit made during upload remains queued after the older upload completes', async () => {
  const d=device(); let release; const writes=[];
  d.connect('alice',(id,record)=>{writes.push(JSON.parse(JSON.stringify(record)));return new Promise(resolve=>release=resolve);});
  d.receive([]); d.api.save([item('one','first')]);
  const upload=d.api.flush(); d.api.save([item('one','second')]); release(); await upload;
  const second=d.api.flush(); release(); await second;
  assert.deepEqual(writes,[item('one','first'),item('one','second')]);
});
test('account changes reject stale subscriptions and upload completions', async () => {
  const d=device(); let release, stale;
  d.api.connect('alice',next=>{stale=next;next([],false);return ()=>{};},()=>new Promise(resolve=>release=resolve));
  d.api.save([item('alice')]); const upload=d.api.flush();
  d.connect('bob'); d.receive([item('bob')]); stale([item('leak')],false);
  release(); await upload; assert.deepEqual(d.records(),[item('bob')]);
  d.connect('alice'); d.receive([]); assert.deepEqual(d.records(),[item('alice')]);
});
test('cache-only snapshots do not erase unsynced account data', async () => {
  const d=device(); d.connect('alice'); d.api.save([item('offline')]); d.receive([],true);
  assert.deepEqual(d.records(),[item('offline')]);
});
