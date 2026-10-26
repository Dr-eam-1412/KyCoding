// This fixed adapter is the entire browser authority. The model never supplies JS, selectors or URLs.
export function pageCommand(command,args) {
  if(location.origin!=='https://smartestu.cn'||location.pathname!=='/assignment')return {error:'仅允许普通作业页面'};
  const buttons=()=>[...document.querySelectorAll('button')];
  const back=()=>buttons().find(b=>b.textContent.trim()==='返回');
  const cards=[...document.querySelectorAll('[id^="question-card-"]')];
  const card=args?.id?.startsWith('question-card-')?cards.find(c=>c.id===args.id):cards[0];
  if(command==='pending_assignments'||command==='grade_catalog') {
    const grades=command==='grade_catalog';
    const selects=[...document.querySelectorAll('select')];
    const classes=selects.find(s=>[...s.options].some(o=>o.textContent.trim()==='全部班级'));
    const status=selects.find(s=>[...s.options].some(o=>o.textContent.trim()==='未完成'));
    if(!classes||!status)return {wait:true};
    for(const [select,label] of [[classes,'全部班级'],[status,grades?'全部状态':'未完成']]) {
      const option=[...select.options].find(o=>o.textContent.trim()===label);
      if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return {wait:true};}
    }
    // The site lazily loads its catalog; never report the first batch as the complete list.
    const complete=[...document.querySelectorAll('div')].some(e=>/^已加载全部（共\s*\d+\s*条）$/.test(e.textContent.trim()));
    const rows=[...document.querySelectorAll('tr')].filter(r=>r.querySelectorAll('td').length>=5);
    if(!complete){rows.at(-1)?.scrollIntoView({block:'end'});return {wait:true};}
    const items=[];
    for(const row of rows){
      const cells=row.querySelectorAll('td'),text=i=>cells[i].textContent.trim();
      const progress=text(3).match(/(\d+)\s*\/\s*(\d+)/);
      if(!grades&&text(3).includes('已完成'))continue;
      if(!progress)return {error:'作业完成状态无法确认，请查看网站'};
      if(grades&&Number(progress[1])===0)continue;
      const course=text(0),title=text(1);
      const options=[...classes.options].filter(o=>o.textContent.trim()===course);
      if(options.length!==1)return {error:'课程身份不唯一，请查看网站'};
      items.push({id:`${course}::${title}`,courseId:options[0].value,course,title,status:text(3),completed:Number(progress[1]),total:Number(progress[2]),deadline:text(2).match(/结束时间\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)?.[1]||'',period:text(2)});
    }
    if(new Set(items.map(a=>a.id)).size!==items.length)return {error:'存在同名作业，无法安全区分，请查看网站'};
    return {value:{items,checkedAt:new Date().toISOString()}};
  }
  if(command==='capture_grade') {
    const header=back()?.parentElement;
    if(header?.querySelector('p')?.textContent.trim()!==args.title)return {error:'成绩对应的作业不一致'};
    const score=(s)=>{const m=s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);return m?{earned:Number(m[1]),possible:Number(m[2])}:null;};
    const rows=buttons().filter(b=>b.title&&b.textContent.trim().startsWith('习题'));
    const questions=rows.map(b=>({title:b.title,score:b.textContent.includes('已批改')?score(b.textContent.split('已批改').at(-1)):null}));
    const countText=[...header.querySelectorAll('span')].find(s=>s.textContent.includes('题目数量'))?.textContent||'';
    const count=Number(countText.match(/题目数量[：:]\s*(\d+)/)?.[1]);
    if(!count||rows.length!==count)return {error:'成绩题目未完整展示，请稍后重试'};
    const total=[...header.querySelectorAll('span')].find(s=>/^\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*$/.test(s.textContent));
    return {value:{title:args.title,score:total?score(total.textContent):null,questions,source:'website',checkedAt:new Date().toISOString()}};
  }
  if(command==='inspect_upload') {
    if(!card||card.id!==args.id)return {error:'未找到指定题目，不能核对上传位置'};
    const input=card.querySelector('input[type="file"]');
    const existingImages=[...card.querySelectorAll('img')].filter(img=>!img.closest('.space-y-0')).length;
    return {value:{platformRef:card.id,title:card.querySelector('h4')?.textContent.trim(),inputId:input?.id||null,multiple:!!input?.multiple,accept:input?.accept||'',selectedFiles:input?.files?.length||0,existingImages,canChoose:!!input&&!input.disabled,hasFinalSubmit:buttons().some(b=>b.textContent.trim()==='提交作业')}};
  }
  if(command==='catalog') {
    const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent.includes(args.course)));
    if(!select)return {wait:true};
    const options=[...select.options].filter(o=>o.textContent.includes(args.course));
    if(options.length!==1)return {error:'课程匹配不唯一，请填写网页上的完整课程名'};
    if(select.value!==options[0].value){select.value=options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}));return {wait:true};}
    const rows=[...document.querySelectorAll('tr')].filter(r=>r.querySelectorAll('td').length>=5);
    const items=rows.map(r=>{const cells=r.querySelectorAll('td');return {id:`${cells[0].textContent.trim()}::${cells[1].textContent.trim()}`,courseId:select.value,course:cells[0].textContent.trim(),title:cells[1].textContent.trim()};}).filter(a=>a.course.includes(args.course));
    return items.length?{value:items}:{wait:true};
  }
  if(command==='open_assignment') {
    // Pending assignments may display every question directly, without a question menu.
    if(cards.length) {
      const header=back()?.parentElement;
      const title=header?.querySelector('p')?.textContent.trim();
      const expectedTitle=args.id.slice(args.id.indexOf('::')+2);
      const count=Number(header?.textContent.match(/题目数量[：:]\s*(\d+)/)?.[1]);
      if(title!==expectedTitle)return {error:'当前作业标题与所选作业不符'};
      if(!count||count!==cards.length)return {error:'题目未完整加载，请先检查网站目录'};
      return {value:{questions:cards.map(c=>({id:c.id,title:c.querySelector('h4')?.textContent.trim()}))}};
    }
    const questionButtons=buttons().filter(b=>b.title&&b.textContent.trim().startsWith('习题'));
    if(questionButtons.length)return {value:{questions:questionButtons.map(b=>({id:b.title,title:b.title}))}};
    const row=[...document.querySelectorAll('tr')].find(r=>{const c=r.querySelectorAll('td');return c.length>=5&&`${c[0].textContent.trim()}::${c[1].textContent.trim()}`===args.id;});
    const view=row&&[...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='查看作业');
    if(view){view.click();return {wait:true};}return {wait:true};
  }
  if(command==='open_question') {
    if(args.id.startsWith('question-card-'))return card?{value:{opened:card.id}}:{error:'当前作业没有该题目'};
    if(card) {
      const title=card.querySelector('h4')?.textContent.trim();
      if(title===args.id)return {value:{opened:args.id}};
      const button=back();if(!button)return {error:'找不到返回题目目录按钮'};button.click();return {wait:true};
    }
    const target=buttons().find(b=>b.title===args.id&&b.textContent.trim().startsWith('习题'));
    if(target){target.click();return {wait:true};}return {wait:true};
  }
  if(command==='capture_question') {
    const content=card?.children[0]?.querySelector('.space-y-0');
    const title=card?.querySelector('h4')?.textContent.trim();
    if(!content||!title)return {error:'未找到可验证的题干区域'};
    // Deliberately exclude siblings (uploaded answers) and aside (marks / feedback).
    if(content.querySelector('canvas,video,iframe,math'))return {error:'该题含尚不支持的动态内容或特殊公式，未导出；请人工确认'};
    const tags=['div','span','p','pre','br','sup','sub','b','strong','em','i','table','tbody','tr','td','th','ul','ol','li','svg','path'];
    let count=0;
    function tree(node) {
      if(++count>20000)throw new Error('题目结构过大');
      if(node.nodeType===3)return node.textContent;
      if(node.nodeType!==1)return '';
      if(node.classList?.contains('ant-image-mask'))return '';
      if(node.tagName.toLowerCase()==='img') {
        if(!node.complete||!node.naturalWidth||!node.naturalHeight)throw new Error('题干配图尚未加载完成，请稍后重试');
        const url=new URL(node.currentSrc||node.src,location.origin);
        if(url.origin!==location.origin||!url.pathname.startsWith('/uploads/homework/'))throw new Error('题干配图来源不在作业图片范围，未导出');
        if(node.naturalWidth*node.naturalHeight>16000000)throw new Error('题干配图过大，未导出');
        const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;
        const context=canvas.getContext('2d');if(!context)throw new Error('无法读取题干配图');
        context.drawImage(node,0,0);
        const src=canvas.toDataURL('image/png');
        if(src.length>2000000)throw new Error('题干配图过大，未导出');
        return {tag:'img',attrs:{src,alt:node.alt||'题干配图',width:node.naturalWidth,height:node.naturalHeight},children:[]};
      }
      const tag=node.tagName.toLowerCase();if(!tags.includes(tag))throw new Error(`不支持的题干元素：${tag}`);
      return {tag,class:node.getAttribute('class')||'',attrs:Object.fromEntries([...node.attributes].filter(a=>['viewBox','d','width','height','preserveAspectRatio'].includes(a.name)).map(a=>[a.name,a.value])),styles:Object.fromEntries([...node.style].map(k=>[k,node.style.getPropertyValue(k)])),children:[...node.childNodes].map(tree)};
    }
    try{return {value:{id:args?.id?.startsWith('question-card-')?card.id:title,title,platformRef:card.id,tree:tree(content)}};}catch(e){return {error:e.message};}
  }
  return {error:'未授权命令'};
}
