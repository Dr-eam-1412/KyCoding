// Only this fixed command can stage user-confirmed images. Never clicks Submit.
export function uploadCommand(args) {
  if(location.origin!=='https://smartestu.cn'||location.pathname!=='/assignment')return {error:'仅允许普通作业页面'};
  const back=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='返回');
  if(back?.parentElement?.querySelector('p')?.textContent.trim()!==args.assignment)return {error:'作业标题不符'};
  if(!Array.isArray(args.rows)||!args.rows.length||args.rows.length>60)return {error:'上传队列无效'};
  const cards=[...document.querySelectorAll('[id^="question-card-"]')];
  if(cards.length!==args.rows.length)return {error:'须在同一页面完整展示全部题目，不能跨页上传'};
  const refs=new Set(),prepared=[];
  // Validate every target before changing any input. Never overwrite existing images.
  for(const row of args.rows) {
    if(!/^question-card-\d+$/.test(row.platformRef)||refs.has(row.platformRef))return {error:'题目标识无效或重复'};
    refs.add(row.platformRef);
    const card=cards.find(c=>c.id===row.platformRef),input=card?.querySelector('input[type="file"]');
    if(!card||card.querySelector('h4')?.textContent.trim()!==row.title||!input||input.disabled||input.id!==row.inputId)return {error:'上传入口与预览不一致'};
    if(input.files?.length||[...card.querySelectorAll('img')].some(img=>!img.closest('.space-y-0')))return {error:'题目已有图片，不自动覆盖'};
    if(!Array.isArray(row.files)||!row.files.length||row.files.length>8||(!input.multiple&&row.files.length>1))return {error:'图片数量无效'};
    const dt=new DataTransfer();
    for(const file of row.files) {
      if(!['image/png','image/jpeg'].includes(file.mime)||typeof file.base64!=='string'||file.base64.length>28000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))return {error:'图片数据无效'};
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
      const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      if((file.mime==='image/png'&&!png)||(file.mime==='image/jpeg'&&!jpg))return {error:'图片内容与类型不符'};
      dt.items.add(new File([bytes],file.name,{type:file.mime}));
    }
    prepared.push({input,dt,count:row.files.length,platformRef:row.platformRef});
  }
  const rows=[];
  for(const item of prepared) {
    if(!item.input.isConnected)return {error:'页面更新中，状态不明；请检查网页，不要重试'};
    item.input.files=item.dt.files;
    item.input.dispatchEvent(new Event('change',{bubbles:true}));
    // The site's change handler may clear the live FileList after taking its files.
    rows.push({platformRef:item.platformRef,count:item.count});
  }
  return {value:{status:'staged',submitted:false,serverConfirmed:false,rows}};
}

// Separately confirmed final action; only the connector's live upload context can invoke it.
export function submissionCommand(command,args) {
  if(location.origin!=='https://smartestu.cn'||location.pathname!=='/assignment')return {error:'仅允许普通作业页面'};
  const buttons=[...document.querySelectorAll('button')];
  if(command==='submission_receipt') {
    const matching=[...document.querySelectorAll('tr')].filter(r=>{const c=r.querySelectorAll('td');return c.length>=5&&c[0].textContent.trim()===args.course&&c[1].textContent.trim()===args.assignment;});
    if(matching.length===1){
      const state=matching[0].querySelectorAll('td')[3].textContent;
      const progress=state.match(/(\d+)\s*\/\s*(\d+)/);
      if(state.includes('已完成')&&progress&&Number(progress[1])===Number(progress[2])&&Number(progress[2])>0)return {value:{submitted:true,serverConfirmed:true,course:args.course,assignment:args.assignment}};
    }
    return {wait:true};
  }
  if(!['inspect_submission','submit_assignment','inspect_confirmation','confirm_submission'].includes(command))return {error:'未授权命令'};
  const header=buttons.find(b=>b.textContent.trim()==='返回')?.parentElement;
  if(header?.querySelector('p')?.textContent.trim()!==args.assignment)return {error:'当前作业已改变，请重新核对'};
  if(!Array.isArray(args.rows)||!args.rows.length)return {error:'缺少上传核对信息'};
  const cards=[...document.querySelectorAll('[id^="question-card-"]')];
  if(cards.length!==args.rows.length)return {error:'题目数量已改变'};
  const refs=new Set(),previewIdentity=[];
  for(const row of args.rows){
    if(!/^question-card-\d+$/.test(row.platformRef)||refs.has(row.platformRef)||!Number.isInteger(row.count)||row.count<1||row.count>8)return {error:'题目标识或图片数量无效'};
    refs.add(row.platformRef);
    const card=cards.find(c=>c.id===row.platformRef);
    if(!card||card.querySelector('h4')?.textContent.trim()!==row.title)return {error:'题目身份已改变'};
    const previews=[...card.querySelectorAll('img')].filter(img=>!img.closest('.space-y-0'));
    if(row.count<1||previews.length!==row.count||previews.some(img=>!img.complete||img.naturalWidth===0))return {error:'图片预览未完整就绪，请检查网页'};
    previewIdentity.push({platformRef:row.platformRef,sources:previews.map(img=>img.currentSrc||img.src)});
  }
  if(args.previewIdentity&&JSON.stringify(args.previewIdentity)!==JSON.stringify(previewIdentity))return {error:'网页上的图片已变化，请停止提交并人工检查'};
  if(command==='inspect_confirmation'||command==='confirm_submission'){
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(d=>d.querySelector('h2')?.textContent.trim()==='确认提交');
    const compact=text=>String(text).replace(/\s+/g,'');
    const expected=`本次将提交${args.rows.length}道题：${args.rows.map(r=>r.title).join('、')}。提交作业后可继续提交剩余题目，是否继续？`;
    if(dialogs.length!==1||compact(dialogs[0].querySelector('p')?.textContent)!==compact(expected))return {error:'提交确认弹窗中的题数或题号不符'};
    const confirms=[...dialogs[0].querySelectorAll('button')].filter(b=>b.textContent.trim()==='确认提交');
    if(confirms.length!==1||confirms[0].disabled)return {error:'网站确认按钮不可用'};
    if(command==='inspect_confirmation')return {value:{ready:true,previewIdentity}};
    if(args.confirmed!==true)return {error:'尚未确认最终提交'};
    confirms[0].click();return {value:{confirmationClicked:true}};
  }
  const submit=buttons.filter(b=>b.textContent.trim()==='提交作业');
  if(submit.length!==1||submit[0].disabled)return {error:'提交按钮不可用'};
  if(command==='inspect_submission')return {value:{ready:true,previewIdentity}};
  if(args.confirmed!==true)return {error:'尚未确认最终提交'};
  submit[0].click();
  return {value:{clicked:true}};
}

// Reconnect only to the original confirmation page. Local blobs or the site's
// saved homework previews are byte-checked against the user's original files.
export async function recoveryPhotoCommand(args){
  if(location.origin!=='https://smartestu.cn'||location.pathname!=='/assignment'||!args.courseId)return {error:'不是原课程页面'};
  const courseId=new URL(location.href).searchParams.get('courseId');
  // The site's all-courses entry omits this parameter. Stable platform question
  // IDs plus exact title and ordered image bytes still bind the original work.
  if(courseId&&courseId!==args.courseId)return {error:'不是原课程页面'};
  const header=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='返回')?.parentElement;
  if(header?.querySelector('p')?.textContent.trim()!==args.assignment)return {error:'不是原作业页面'};
  if(!Array.isArray(args.rows)||!args.rows.length||args.rows.length>60||!Array.isArray(args.photoHashes)||args.photoHashes.length!==args.rows.length)return {error:'缺少原始图片校验信息'};
  const cards=[...document.querySelectorAll('[id^="question-card-"]')];
  if(cards.length!==args.rows.length)return {error:'题目数量已变化'};
  const photoOrder=[];
  for(let n=0;n<args.rows.length;n++){
    const row=args.rows[n],card=cards.find(c=>c.id===row.platformRef),expected=args.photoHashes[n];
    if(!card||card.querySelector('h4')?.textContent.trim()!==row.title||!Array.isArray(expected)||expected.length!==row.count||row.count<1||row.count>8)return {error:'图片与题目不匹配'};
    const images=[...card.querySelectorAll('img')].filter(i=>!i.closest('.space-y-0'));
    if(images.length!==row.count)return {error:'图片数量已变化'};
    const remaining=expected.map((hash,index)=>({hash,index})),order=[];
    for(let i=0;i<images.length;i++){
      const src=images[i].currentSrc||images[i].src;
      const local=src.startsWith('blob:https://smartestu.cn/');
      const saved=/^https:\/\/smartestu\.cn\/uploads\/homework\/[\w-]+\.(png|jpe?g)$/.test(src);
      if(!images[i].complete||!images[i].naturalWidth||(!local&&!saved)||!/^[a-f0-9]{64}$/.test(expected[i]))return {error:'不能安全验证原图片'};
      const response=await fetch(src,{redirect:'error'}),blob=await response.blob();
      if(!response.ok||blob.size>28*1024*1024)return {error:'图片读取失败或过大'};
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
      const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
      const match=remaining.findIndex(photo=>photo.hash===hash);
      if(match<0)return {error:'网页图片内容已改变，不是本题的原始答案'};
      order.push(remaining.splice(match,1)[0].index);
    }
    photoOrder.push(order);
  }
  return {value:{verified:true,photoOrder}};
}
