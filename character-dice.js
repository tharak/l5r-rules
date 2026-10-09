(() => {
  const R = (globalThis.window || globalThis).CharacterRules;
  const integer = value => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;

  function adjustPool(base, bonuses = {}) {
    return R.dicePool(integer(base.rolled) + integer(bonuses.rolled), integer(base.kept) + integer(bonuses.kept), integer(base.bonus) + integer(bonuses.bonus));
  }

  function d10() {
    const random = new Uint32Array(1);
    do { globalThis.crypto.getRandomValues(random); } while (random[0] >= 4294967290);
    return random[0] % 10 + 1;
  }

  function roll(pool, {explodes = true, emphasis = false, nextDie = d10} = {}) {
    const normalized = R.dicePool(pool.rolled, pool.kept, pool.bonus);
    const draw = () => {
      const value = nextDie();
      if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error('A die must return a number from 1 to 10.');
      return value;
    };
    const dice = Array.from({length: normalized.rolled}, () => {
      let value = draw();
      const rerolled = emphasis && value === 1;
      if (rerolled) value = draw();
      const faces = [value];
      while (explodes && value === 10) { value = draw(); faces.push(value); }
      return {faces, rerolled, total: faces.reduce((sum, face) => sum + face, 0), kept: false};
    });
    dice.map((die, index) => ({die, index})).sort((a, b) => b.die.total - a.die.total || a.index - b.index).slice(0, normalized.kept).forEach(({die}) => { die.kept = true; });
    return {pool: normalized, dice, total: dice.filter(die => die.kept).reduce((sum, die) => sum + die.total, normalized.bonus)};
  }

  (globalThis.window || globalThis).CharacterDice = {adjustPool, roll};
})();
