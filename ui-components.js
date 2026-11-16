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
  // The elemental icon sits under the image sprite, remaining visible while
  // the image is unavailable. Both Books and the character editor use this mark.
  function ringMark({ring,placeholder=false,attrs={}} = {}) {
    const marks = {
      Air: '<path d="M5 12h15c7 0 7-8 2-8-3 0-4 2-4 3M5 17h23M5 22h13c7 0 7 8 2 8-3 0-4-2-4-3"/>',
      Earth: '<path d="m4 27 12-21 12 21ZM11 15l5 4 5-4M8 27h16"/>',
      Fire: '<path d="M17 3c2 8 11 12 10 20-1 6-5 8-11 8S5 27 5 21c0-5 4-8 6-11 0 5 1 7 3 8 4-4 4-10 3-15Z"/>',
      Water: '<path d="M4 12c4-6 8 6 12 0s8 6 12 0M4 19c4-6 8 6 12 0s8 6 12 0M4 26c4-6 8 6 12 0s8 6 12 0"/>',
      Void: '<circle cx="16" cy="17" r="12"/><circle cx="16" cy="17" r="7"/><circle cx="16" cy="17" r="1"/>'
    };
    if (!marks[ring]) return '';
    const icon = `<svg class="ui-ring-placeholder" viewBox="0 0 32 34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${marks[ring]}</svg>`;
    return element('span',{'aria-hidden':true,...attrs,'data-ring':ring,class:classes('ui-ring-mark',attrs.class)},icon+(placeholder?'':element('span',{class:'creator-ring-symbol','data-ring':ring},'')));
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
  // Pictures are stored inline as small base64 images. Only this exact shape is
  // rendered, so a stored value can never become a script or remote URL.
  const PORTRAIT_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const PORTRAIT_MAX_LENGTH = 120000;
  const isPortrait = value => typeof value === 'string' && value.length <= PORTRAIT_MAX_LENGTH && PORTRAIT_PATTERN.test(value);
  // The picker renders the current picture (or a placeholder), a file input and,
  // when there is a picture, a Remove button. Controllers handle both events.
  function portrait({label='Picture',src='',name='',attrs={},inputAttrs={},removeAttrs={},actionsHtml=''} = {}) {
    const image = isPortrait(src)
      ? `<img class="ui-portrait-image" src="${src}" alt="${escape(name ? `Picture of ${name}` : label)}">`
      : element('span',{class:'ui-portrait-image ui-portrait-empty','aria-hidden':true},'');
    const pick = element('label',{class:'ui-portrait-pick ui-button ui-button--secondary ui-button--compact'},`${escape(src ? 'Change picture' : 'Add picture')}${element('input',{type:'file',accept:'image/*',...inputAttrs,class:classes('ui-portrait-input',inputAttrs.class),'aria-label':`${src ? 'Change' : 'Add'} ${label.toLowerCase()}`})}`);
    const remove = src ? button({text:'Remove picture',variant:'quiet',size:'compact',attrs:removeAttrs}) : '';
    return element('div',{...attrs,class:classes('ui-portrait',attrs.class)},image+element('div',{class:'ui-portrait-actions'},pick+actionsHtml+remove));
  }
  // Square cropper geometry, kept pure so it can be tested. `view` is the frame's
  // side in CSS pixels; zoom 1 is the smallest scale that still fills the frame.
  // x/y are the image's top-left offset inside the frame and are clamped so the
  // image always covers the frame. `source` is the square to copy from the image.
  const MAX_ZOOM = 4;
  function cropGeometry({width,height,view,zoom=1,x,y}) {
    zoom = Math.min(Math.max(Number(zoom) || 1,1),MAX_ZOOM);
    const scale = Math.max(view/width,view/height)*zoom, w = width*scale, h = height*scale;
    const clamp = (value,min) => Math.min(0,Math.max(min,value));
    x = clamp(x ?? (view-w)/2,view-w); y = clamp(y ?? (view-h)/2,view-h);
    return {zoom,scale,x,y,w,h,source:{x:-x/scale,y:-y/scale,size:view/scale}};
  }
  // Keep the image point under (px,py) fixed while changing zoom.
  function zoomGeometry(current,{width,height,view},zoom,px = view/2,py = view/2) {
    const next = cropGeometry({width,height,view,zoom,x:0,y:0});
    const ratio = next.scale/current.scale;
    return cropGeometry({width,height,view,zoom:next.zoom,x:px-(px-current.x)*ratio,y:py-(py-current.y)*ratio});
  }
  // Encode a square canvas as a stored picture: scale it down to at most
  // `size` pixels on a white ground, then lower JPEG quality until it fits.
  function encodePortrait(source,size = 256) {
    const side = Math.max(1,Math.min(size,source.width));
    let canvas = source;
    if (source.width !== side || source.height !== side) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = side;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0,0,side,side);
      context.imageSmoothingQuality = 'high';
      context.drawImage(source,0,0,side,side);
    }
    for (const quality of [0.85,0.7,0.55,0.4]) {
      const picture = canvas.toDataURL('image/jpeg',quality);
      if (isPortrait(picture)) return picture;
    }
    throw new Error('This picture is too detailed to store. Try a simpler or smaller image.');
  }
  // Open a modal where the viewer drags and zooms the chosen image inside a
  // square, then save that square as a JPEG of at most `size` pixels.
  // Resolves with the picture, or null when the viewer cancels.
  function readPortrait(file,{size=256} = {}) {
    if (!file || !/^image\//.test(file.type)) return Promise.reject(new Error('Choose an image file.'));
    return new Promise((resolve,reject) => {
      const url = URL.createObjectURL(file), image = new Image();
      image.alt = '';
      image.className = 'ui-cropper-image';
      image.draggable = false;
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This picture could not be read.')); };
      image.onload = () => {
        const holder = document.createElement('div');
        holder.innerHTML = dialog({title:'Position picture',titleId:'ui-cropper-title',attrs:{class:'ui-cropper'},bodyClass:'ui-cropper-body',
          bodyHtml:`<p class="ui-cropper-help">Drag the picture to position it. Zoom with the slider, the mouse wheel, a pinch, or the + and − keys. Arrow keys move it.</p>${element('div',{class:'ui-cropper-frame',tabindex:0,role:'group','aria-label':'Picture position'},'')}${field({label:'Zoom',type:'range',attrs:{class:'ui-cropper-zoom',min:1,max:MAX_ZOOM,step:0.01,value:1}})}`,
          footerHtml:button({text:'Cancel',variant:'secondary',attrs:{'data-cropper':'cancel'}})+button({text:'Use picture',attrs:{'data-cropper':'use'}})});
        document.body.append(holder);
        const box = holder.querySelector('dialog'), frame = box.querySelector('.ui-cropper-frame'), slider = box.querySelector('.ui-cropper-zoom');
        frame.append(image);
        box.showModal();
        const natural = {width:image.naturalWidth,height:image.naturalHeight,view:frame.clientWidth || 256};
        let geometry = cropGeometry(natural);
        const apply = next => {
          geometry = next;
          Object.assign(image.style,{width:`${next.w}px`,height:`${next.h}px`,transform:`translate(${next.x}px,${next.y}px)`});
          slider.value = String(next.zoom);
        };
        const move = (dx,dy) => apply(cropGeometry({...natural,zoom:geometry.zoom,x:geometry.x+dx,y:geometry.y+dy}));
        const zoomTo = (zoom,px,py) => apply(zoomGeometry(geometry,natural,zoom,px,py));
        const local = event => { const r = frame.getBoundingClientRect(); return [event.clientX-r.left,event.clientY-r.top]; };
        apply(geometry);
        // One pointer drags; two pointers pinch-zoom around their midpoint.
        const pointers = new Map();
        let pinch = null;
        frame.addEventListener('pointerdown',event => {
          frame.setPointerCapture(event.pointerId); pointers.set(event.pointerId,local(event)); frame.focus();
          if (pointers.size === 2) { const [a,b] = [...pointers.values()]; pinch = {distance:Math.hypot(a[0]-b[0],a[1]-b[1]) || 1,zoom:geometry.zoom}; }
        });
        frame.addEventListener('pointermove',event => {
          const previous = pointers.get(event.pointerId);
          if (!previous) return;
          const point = local(event); pointers.set(event.pointerId,point);
          if (pointers.size === 1) move(point[0]-previous[0],point[1]-previous[1]);
          else if (pinch) { const [a,b] = [...pointers.values()]; zoomTo(pinch.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.distance,(a[0]+b[0])/2,(a[1]+b[1])/2); }
        });
        const release = event => { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; };
        frame.addEventListener('pointerup',release); frame.addEventListener('pointercancel',release);
        frame.addEventListener('wheel',event => { event.preventDefault(); zoomTo(geometry.zoom*Math.exp(-event.deltaY*0.0015),...local(event)); },{passive:false});
        frame.addEventListener('keydown',event => {
          const step = event.shiftKey ? 40 : 10;
          const moves = {ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
          if (moves[event.key]) move(...moves[event.key]);
          else if (['+','='].includes(event.key)) zoomTo(geometry.zoom*1.1);
          else if (['-','_'].includes(event.key)) zoomTo(geometry.zoom/1.1);
          else return;
          event.preventDefault();
        });
        slider.addEventListener('input',() => zoomTo(Number(slider.value)));
        const finish = result => { box.close(); holder.remove(); URL.revokeObjectURL(url); resolve(result); };
        box.addEventListener('cancel',event => { event.preventDefault(); finish(null); });
        box.querySelector('[data-cropper="cancel"]').addEventListener('click',() => finish(null));
        box.querySelector('[data-cropper="use"]').addEventListener('click',() => {
          const {source} = geometry, side = Math.max(1,Math.min(size,Math.round(source.size)));
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = side;
          const context = canvas.getContext('2d');
          context.fillStyle = '#fff'; context.fillRect(0,0,side,side);
          context.drawImage(image,source.x,source.y,source.size,source.size,0,0,side,side);
          try { finish(encodePortrait(canvas,size)); }
          catch (error) { box.close(); holder.remove(); URL.revokeObjectURL(url); reject(error); }
        });
        frame.focus();
      };
      image.src = url;
    });
  }
  window.UI = {escape,attributes,element,button,ringMark,link,option,field,checkbox,choiceGroup,stepper,disclosure,panel,sectionHeading,actionRow,card,recordRow,dialog,feedback,recordEditor,portrait,readPortrait,encodePortrait,cropGeometry,zoomGeometry,isPortrait,PORTRAIT_MAX_LENGTH};
})();
