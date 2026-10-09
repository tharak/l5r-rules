const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const context = vm.createContext({window:{},crypto:require('node:crypto').webcrypto});
for(const file of ['character-catalog.js','character-rules.js','character-dice.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const R=context.window.CharacterRules,D=context.window.CharacterDice;
const plain=value=>JSON.parse(JSON.stringify(value));
const sequence=values=>{let i=0;return ()=>{assert.ok(i<values.length,'Unexpected extra die roll');return values[i++];};};

test('roll and keep selects the highest dice, resolves ties consistently, and adds the flat bonus',()=>{
  const result=D.roll({rolled:3,kept:2,bonus:4},{nextDie:sequence([8,8,3])});
  assert.equal(result.total,20);
  assert.deepEqual(plain(result.dice.map(d=>d.kept)),[true,true,false]);
  const tie=D.roll({rolled:2,kept:1,bonus:0},{nextDie:sequence([8,8])});
  assert.deepEqual(plain(tie.dice.map(d=>d.kept)),[true,false]);
});

test('trained rolls explode repeatedly while unskilled rolls keep a ten without another draw',()=>{
  const trained=D.roll({rolled:2,kept:1,bonus:0},{nextDie:sequence([10,10,4,8])});
  assert.equal(trained.total,24);
  assert.deepEqual(plain(trained.dice[0].faces),[10,10,4]);
  const untrained=D.roll({rolled:2,kept:1,bonus:0},{explodes:false,nextDie:sequence([10,8])});
  assert.equal(untrained.total,10);
  assert.deepEqual(plain(untrained.dice[0].faces),[10]);
});

test('emphasis rerolls initial ones once, permits explosion of a reroll, and does not reroll explosion faces',()=>{
  const repeated=D.roll({rolled:2,kept:1,bonus:0},{emphasis:true,nextDie:sequence([1,1,6])});
  assert.equal(repeated.total,6);
  assert.equal(repeated.dice[0].rerolled,true);
  assert.equal(repeated.dice[0].total,1);
  const exploded=D.roll({rolled:1,kept:1,bonus:0},{emphasis:true,nextDie:sequence([1,10,1])});
  assert.equal(exploded.total,11);
  assert.deepEqual(plain(exploded.dice[0].faces),[10,1]);
});

test('bonuses apply to the original pool before the ten-dice conversion',()=>{
  assert.equal(D.adjustPool({rolled:11,kept:6,bonus:0},{rolled:1}).notation,'10k7');
  assert.equal(D.adjustPool({rolled:10,kept:10,bonus:0},{rolled:2,kept:1,bonus:3}).notation,'10k10+9');
  assert.equal(D.adjustPool({rolled:2,kept:2,bonus:0},{rolled:-5,kept:3,bonus:-4}).notation,'0k0-4');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/character-data.json'),'utf8'));
  const skill=R.calculate({skills:{'Heavy Weapons':5},traitBuys:{Agility:4}},catalog).skills['Heavy Weapons'];
  assert.equal(skill.rollBase.rolled,11);
  assert.equal(skill.roll.notation,'10k6');
  assert.equal(D.adjustPool(skill.rollBase,{rolled:1}).notation,'10k7');
});

test('zero dice and negative bonuses are valid, invalid die values are rejected, and random draws stay within d10',()=>{
  assert.equal(D.roll({rolled:0,kept:0,bonus:-3}).total,-3);
  assert.throws(()=>D.roll({rolled:1,kept:1,bonus:0},{nextDie:()=>11}),/1 to 10/);
  for(let i=0;i<30;i++) {
    const result=D.roll({rolled:10,kept:5,bonus:0},{explodes:false});
    assert.equal(result.dice.length,10);
    assert.equal(result.dice.filter(d=>d.kept).length,5);
    assert.ok(result.dice.every(d=>d.faces[0]>=1&&d.faces[0]<=10));
  }
});
