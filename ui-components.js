/* Shared, stateless HTML renderers. Text/attributes are escaped; *Html options
 * accept markup composed by our renderers. Controllers own events and state. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const booleans = new Set(['disabled','readonly','checked','selected','hidden','multiple','required','autofocus','open','inert']);
  function attributes(values = {}) {
    return Object.entries(values).flatMap(([name,value]) => {
      if (!/^[a-z][a-z0-9:_-]*$/i.test(name) || /^on/i.test(name) || name.toLowerCase() === 'srcdoc') throw new TypeError(`Unsupported UI attribute: ${name}`);
      if (value == null || (value === false && !/^(aria|data)-/.test(name))) return [];
      if (booleans.has(name.toLowerCase())) return value ? [name] : [];
      if (['href','src','action','formaction'].includes(name.toLowerCase()) && /^(?:\s*[\x00-\x20]*)(?:javascript|data|vbscript):/i.test(String(value).replace(/[\x00-\x20]/g,''))) throw new TypeError('Unsupported UI URL');
      return [`${name}="${escape(value)}"`];
    }).join(' ');
  }
  const classes = (...values) => values.filter(Boolean).join(' ');
  const content = (text, html) => html ?? escape(text);
  function element(tag, attrs, html = '') {
    if (!['a','article','aside','button','details','dialog','div','fieldset','footer','header','h1','h2','h3','h4','input','label','nav','option','output','p','section','select','span','summary','textarea'].includes(tag)) throw new TypeError(`Unsupported UI element: ${tag}`);
    const props = attributes(attrs);
    return `<${tag}${props?' '+props:''}>${tag==='input'?'':html+`</${tag}>`}`;
  }
  function button({text='',html,variant='primary',size='regular',attrs={}} = {}) {
    return element('button',{type:'button',...attrs,class:classes('ui-button',`ui-button--${variant}`,`ui-button--${size}`,attrs.class)},content(text,html));
  }
  function link({text='',html,href='#',attrs={}} = {}) {
    return element('a',{href,...attrs,class:classes('ui-link',attrs.class)},content(text,html));
  }
  function option({value='',label=value,selected=false,attrs={}} = {}) {
    return element('option',{value,...attrs,selected},escape(label));
  }
  function field({label,kind='input',type='text',value,options=[],optionsHtml,attrs={},labelAttrs={}} = {}) {
    const props = {...(kind==='input'?{type}:{}),...attrs,class:classes('ui-field',attrs.class)};
    let control;
    if (kind === 'select') control = element('select',props,optionsHtml ?? options.map(item=>option({...item,selected:item.selected ?? item.value===value})).join(''));
    // HTML discards one initial newline in a textarea; keep the user's own.
    else if (kind === 'textarea') control = element('textarea',props,'\n'+escape(value));
    else control = element('input',{...props,...(value!==undefined?{value}:{})});
    return label == null ? control : element('label',{...labelAttrs,class:classes('ui-field-label',labelAttrs.class)},escape(label)+control);
  }
  function checkbox({label='',attrs={},labelAttrs={}} = {}) {
    return element('label',{...labelAttrs,class:classes('ui-checkbox',labelAttrs.class)},element('input',{type:'checkbox',...attrs})+escape(label));
  }
  function choiceGroup({label,choices=[],attrs={},radio=false,name,value} = {}) {
    const items = choices.map(choice=>radio
      ? element('label',{},element('input',{type:'radio',name,...choice.attrs,value:choice.value,checked:value===choice.value})+element('span',{},escape(choice.label)))
      : button({text:choice.label,variant:'quiet',attrs:{...choice.attrs,'aria-pressed':choice.value===value}})).join('');
    return element('div',{role:radio?'radiogroup':'group','aria-label':label,...attrs,class:classes('ui-choice-group',attrs.class)},items);
  }
  function stepper({value,label,outputLabel=label,size='regular',attrs={},outputAttrs={},decrease={},increase={}} = {}) {
    const control = (text,config) => button({text,variant:'quiet',size,attrs:config});
    return element('div',{role:'group','aria-label':label,...attrs,class:classes('rank-control','ui-stepper',`ui-stepper--${size}`,attrs.class)},
      control('−',decrease)+element('output',{...outputAttrs,...(outputAttrs['aria-label']==null && outputLabel!=null?{'aria-label':outputLabel}:{})},escape(value))+control('+',increase));
  }
  function disclosure({title,titleHtml,bodyHtml='',attrs={}} = {}) {
    return element('details',{...attrs,class:classes('ui-disclosure',attrs.class)},element('summary',{},content(title,titleHtml))+bodyHtml);
  }
  function panel({bodyHtml='',tag='section',attrs={}} = {}) {
    return element(tag,{...attrs,class:classes('ui-panel',attrs.class)},bodyHtml);
  }
  function sectionHeading({title,description,step,actionsHtml='',level=2,attrs={}} = {}) {
    const titleHtml = element(`h${level}`,{},escape(title));
    const body = step == null ? titleHtml : element('span',{class:'creator-step'},escape(step))+element('div',{},titleHtml+(description?element('p',{},escape(description)):''));
    return element('div',{...attrs,class:classes('ui-heading',step==null?'workspace-head':'creator-panel-head',attrs.class)},body+actionsHtml);
  }
  function actionRow({bodyHtml='',attrs={}} = {}) {
    return element('div',{...attrs,class:classes('ui-action-row',attrs.class)},bodyHtml);
  }
  function card({bodyHtml='',href,attrs={}} = {}) {
    return element(href?'a':'article',{...(href?{href}:{}),...attrs,class:classes('ui-card',attrs.class)},bodyHtml);
  }
  function recordRow({bodyHtml='',actionsHtml='',tag='div',attrs={}} = {}) {
    return element(tag,{...attrs,class:classes('ui-record-row',attrs.class)},bodyHtml+actionsHtml);
  }
  function dialog({title,titleId,headerHtml,bodyHtml='',footerHtml='',headerClass,bodyClass,attrs={}} = {}) {
    const header = headerHtml ?? element('h2',{id:titleId},escape(title));
    return element('dialog',{...attrs,'aria-labelledby':titleId ?? attrs['aria-labelledby'],class:classes('ui-dialog',attrs.class)},element('header',{class:headerClass},header)+element('div',{class:bodyClass},bodyHtml)+(footerHtml?element('footer',{},footerHtml):''));
  }
  function feedback({text='',html,kind='status',attrs={}} = {}) {
    return element('p',{role:kind==='error'?'alert':'status',...attrs,class:classes('ui-feedback',`ui-feedback--${kind}`,attrs.class)},content(text,html));
  }
  // An editor shell shares fields and actions; autosave and permissions stay in
  // the session/NPC/entry controllers and are expressed through field options.
  function recordEditor({fields=[],extraHtml='',actionsHtml='',attrs={}} = {}) {
    return element('div',{...attrs,class:classes('ui-record-editor',attrs.class)},fields.map(field).join('')+extraHtml+actionRow({bodyHtml:actionsHtml}));
  }
  window.UI = {escape,attributes,element,button,link,option,field,checkbox,choiceGroup,stepper,disclosure,panel,sectionHeading,actionRow,card,recordRow,dialog,feedback,recordEditor};
})();
