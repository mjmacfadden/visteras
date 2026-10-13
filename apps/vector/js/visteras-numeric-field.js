/** Numeric expressions in field units. Leading plus, multiply or divide are relative; minus is negative. */
export function evalNumericField(text, { current = 0, unit = 'px', pxPerInch = 96 } = {}) {
  const factors = { px:1, pt:pxPerInch/72, pc:pxPerInch/6, in:pxPerInch, '"':pxPerInch, mm:pxPerInch/25.4, cm:pxPerInch/2.54 };
  if (!factors[unit]) return null;
  const source = String(text).trim();
  if (!source) return null;
  const tokens = []; let pos = 0;
  while (pos < source.length) {
    const rest = source.slice(pos), space = /^\s+/.exec(rest);
    if (space) { pos += space[0].length; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:\s*(px|pt|pc|in|mm|cm|"|%))?/i.exec(rest);
    if (number) {
      const suffix = (number[1] || '').toLowerCase(), raw = parseFloat(number[0]);
      tokens.push({ value: suffix && suffix !== '%' ? raw*factors[suffix]/factors[unit] : raw, percent:suffix === '%' });
      pos += number[0].length;
    } else if ('+-*/'.includes(rest[0])) { tokens.push(rest[0]); pos++; }
    else return null;
  }
  if (['+','*','/'].includes(tokens[0])) tokens.unshift({value:current,percent:false});
  let index = 0;
  function atom() {
    let sign = 1;
    if (tokens[index] === '-') { sign = -1; index++; }
    const token = tokens[index++];
    if (!token || typeof token === 'string') throw Error('number');
    return { value: token.value*sign, percent:token.percent };
  }
  function combine(left, op, right) {
    const rv = right.percent ? (op === '+' || op === '-' ? left.value*right.value/100 : right.value/100) : right.value;
    const value = op === '+' ? left.value+rv : op === '-' ? left.value-rv : op === '*' ? left.value*rv : left.value/rv;
    return {value,percent:left.percent && (op === '*' || op === '/') && !right.percent};
  }
  function product() {
    let value = atom();
    while (tokens[index] === '*' || tokens[index] === '/') { const op = tokens[index++]; value = combine(value, op, atom()); }
    return value;
  }
  try {
    let result = product();
    while (tokens[index] === '+' || tokens[index] === '-') { const op = tokens[index++]; result = combine(result, op, product()); }
    if (index !== tokens.length) return null;
    const value = result.percent ? current*result.value/100 : result.value;
    return Number.isFinite(value) ? Number(value.toPrecision(15)) : null;
  } catch { return null; }
}

export function readNumericField(input, unit = 'px') {
  if (input.dataset.numericInvalid === '1') return null;
  return evalNumericField(input.value, { current:Number(input.dataset.numericCurrent || 0), unit });
}
/** Attach expression commits/steppers at runtime; no DOM access on import. */
export function bindNumericField(input, { unit = () => 'px', apply = () => {}, format = value => String(Number(value.toFixed(3))) } = {}) {
  input.type = 'text'; input.setAttribute('inputmode','decimal');
  input.dataset.numericCurrent = String(Number(input.value) || 0);
  const commit = value => {
    if (value === null) { input.dataset.numericInvalid = '1'; input.value = format(Number(input.dataset.numericCurrent)); return; }
    input.dataset.numericInvalid = '0';
    const changed = value !== Number(input.dataset.numericCurrent);
    input.value = format(value); input.dataset.numericCurrent = String(value); if (changed) apply(value);
  };
  input.addEventListener('input', () => { input.dataset.numericInvalid = '0'; });
  input.addEventListener('change', () => commit(readNumericField(input, unit())));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation();
      const base = readNumericField(input, unit()) ?? Number(input.dataset.numericCurrent);
      commit(base + (event.key === 'ArrowUp' ? 1 : -1)*(event.shiftKey ? 10 : 1));
    } else if (event.key === 'Enter') { event.preventDefault(); commit(readNumericField(input, unit())); input.blur(); }
  });
}
