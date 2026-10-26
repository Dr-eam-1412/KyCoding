import { pageCommand } from './page-command.js';
import { uploadCommand,submissionCommand,recoveryPhotoCommand } from './upload-command.js';
const status=document.querySelector('#status');
let running=false,loopActive=false,lastId='',tabId,staged=false,uploadContext=null,submissionAttempted=false,pendingConfirmation=false,recoveredTab=false;
document.querySelector('#stop').onclick=()=>{running=false;status.textContent='已停止';};
async function execute(command,args) {
  if(command==='upload_permission')return {allowed:document.querySelector('#allow-upload').checked&&!staged};
  if(command==='inspect_pending_confirmation'){
    if(submissionAttempted)throw new Error('已有最终提交尝试，不自动重复执行');
    const matches=[],reasons=[];
    for(const tab of await chrome.tabs.query({url:'https://smartestu.cn/assignment*'})){
      const url=new URL(tab.url);
      if(url.origin!=='https://smartestu.cn'||url.pathname!=='/assignment'||(url.searchParams.has('courseId')&&url.searchParams.get('courseId')!==args.courseId))continue;
      const [photos]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:recoveryPhotoCommand,args:[args]});
      if(!photos?.result?.value?.verified){reasons.push(photos?.result?.error||'原图片校验未返回');continue;}
      const [dialog]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:submissionCommand,args:['inspect_confirmation',args]});
      if(dialog?.result?.value?.ready)matches.push({id:tab.id,previewIdentity:dialog.result.value.previewIdentity,photoOrder:photos.result.value.photoOrder});
      else reasons.push(dialog?.result?.error||'确认弹窗校验未返回');
    }
    if(matches.length!==1)throw new Error(matches.length>1?'存在多个完全一致的确认页面，不能唯一选择':`未找到可接续的确认页面：${reasons[0]||'没有匹配的课程页面'}`);
    tabId=matches[0].id;recoveredTab=true;staged=true;pendingConfirmation=true;
    uploadContext={...args,previewIdentity:matches[0].previewIdentity};
    return {ready:true,photoOrder:matches[0].photoOrder};
  }
  if(command==='catalog'||command==='pending_assignments'||command==='grade_catalog') {
    if(staged)throw new Error('网页中已有待提交图片，请先人工检查；重新连接时会新开任务页');
    // Use a separate task tab; never navigate the user's existing tab or touch its unfinished answer.
    if(!tabId||recoveredTab){tabId=(await chrome.tabs.create({url:'https://smartestu.cn/assignment',active:false})).id;recoveredTab=false;}
    else await chrome.tabs.update(tabId,{url:'https://smartestu.cn/assignment'});
  }
  let tab=await chrome.tabs.get(tabId);
  const navigationDeadline=Date.now()+15000;
  while(tab.status==='loading'||!tab.url){
    if(Date.now()>navigationDeadline)throw new Error('作业页面打开超时，请检查网络');
    await new Promise(resolve=>setTimeout(resolve,150));tab=await chrome.tabs.get(tabId);
  }
  const url=new URL(tab.url);
  if(url.origin!=='https://smartestu.cn'||url.pathname!=='/assignment')throw new Error('请先登录 smartestu.cn，再重新读取作业');
  if(command==='upload_files') {
    if(staged)throw new Error('本连接已执行上传，禁止重复发送');
    if(!document.querySelector('#allow-upload').checked)throw new Error('请先在连接页勾选允许本次上传');
    staged=true; // Fail closed even if the reply is lost. Never replay a write.
    document.querySelector('#allow-upload').checked=false;
    await chrome.tabs.update(tabId,{active:true});
    const [result]=await chrome.scripting.executeScript({target:{tabId},func:uploadCommand,args:[args]});
    if(result?.result?.error)throw new Error(result.result.error);
    if(!result?.result?.value)throw new Error('上传状态不明，请检查网页，禁止盲目重试');
    uploadContext={fingerprint:args.fingerprint,assignment:args.assignment,course:args.course,rows:args.rows.map(r=>({platformRef:r.platformRef,title:r.title,count:r.files.length}))};
    const previewDeadline=Date.now()+15000;
    while(Date.now()<previewDeadline){
      const [preview]=await chrome.scripting.executeScript({target:{tabId},func:submissionCommand,args:['inspect_submission',uploadContext]});
      if(preview?.result?.value?.ready){uploadContext.previewIdentity=preview.result.value.previewIdentity;break;}
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    if(!uploadContext.previewIdentity)throw new Error('图片已传入，但未确认预览加载，请检查网页');
    return result.result.value;
  }
  if(command==='inspect_submission'||command==='submit_assignment'||command==='confirm_pending_submission') {
    if(!uploadContext||submissionAttempted||args.fingerprint!==uploadContext.fingerprint||args.assignment!==uploadContext.assignment||args.course!==uploadContext.course||JSON.stringify(args.rows)!==JSON.stringify(uploadContext.rows))throw new Error('上传会话已变化，请检查网页，不能直接提交');
    if(command!=='inspect_submission'){
      if(args.confirmed!==true)throw new Error('尚未确认最终提交');
      if((command==='confirm_pending_submission')!==pendingConfirmation)throw new Error('提交阶段已变化，请重新核对');
      submissionAttempted=true; // A lost reply never permits a second click.
    }
    const verifiedArgs={...args,previewIdentity:uploadContext.previewIdentity};
    const [result]=await chrome.scripting.executeScript({target:{tabId},func:submissionCommand,args:[command==='confirm_pending_submission'?'confirm_submission':command,verifiedArgs]});
    if(result?.result?.error)throw new Error(result.result.error);
    if(command==='inspect_submission')return result?.result?.value;
    if(command==='confirm_pending_submission'){
      if(!result?.result?.value?.confirmationClicked)throw new Error('未确认最终提交动作');
    }else{
      if(!result?.result?.value?.clicked)throw new Error('未确认提交动作');
      const deadline=Date.now()+8000;let ready=false;
      while(Date.now()<deadline){
        const [dialog]=await chrome.scripting.executeScript({target:{tabId},func:submissionCommand,args:['inspect_confirmation',verifiedArgs]});
        if(dialog?.result?.value?.ready){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!ready)throw new Error('网站二次确认内容未通过核对，已停止');
      const [confirmed]=await chrome.scripting.executeScript({target:{tabId},func:submissionCommand,args:['confirm_submission',verifiedArgs]});
      if(!confirmed?.result?.value?.confirmationClicked)throw new Error(confirmed?.result?.error||'未确认最终提交动作');
    }
    const until=Date.now()+20000;
    while(Date.now()<until){
      const [receipt]=await chrome.scripting.executeScript({target:{tabId},func:submissionCommand,args:['submission_receipt',args]});
      if(receipt?.result?.value){
        const value=receipt.result.value;
        if(value.submitted===true&&value.serverConfirmed===true&&value.course===args.course&&value.assignment===args.assignment){staged=false;uploadContext=null;pendingConfirmation=false;submissionAttempted=false;return value;}
        throw new Error('网站回执与原作业不匹配');
      }
      if(receipt?.result?.error)throw new Error(receipt.result.error);
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw new Error('已发起提交，但网站未显示可确认的完成状态，请人工核对');
  }
  const until=Date.now()+(['pending_assignments','grade_catalog'].includes(command)?60000:15000);
  while(true) {
    const [result]=await chrome.scripting.executeScript({target:{tabId},func:pageCommand,args:[command,args]});
    if(!result?.result)throw new Error('页面未返回结果');
    if(result.result.error)throw new Error(result.result.error);
    if(!result.result.wait)return result.result.value;
    if(Date.now()>until)throw new Error('页面加载超时或结构发生变化，请打开作业页面后重试');
    await new Promise(resolve=>setTimeout(resolve,350));
  }
}
document.querySelector('#start').onclick=async()=>{
  if(loopActive)return;
  if(!globalThis.chrome?.runtime?.id){status.textContent='请从 Chrome 扩展图标打开连接页，不能直接打开本地 HTML 文件。';return;}
  running=true;loopActive=true;
  let token='';
  while(running) {
    try {
      if(!token){
        const session=await fetch('http://127.0.0.1:17321/session',{method:'POST',cache:'no-store'});
        if(!session.ok)throw new Error('连接尚未就绪');
        token=(await session.json()).token;
        if(!/^[a-f0-9]{48}$/.test(token))throw new Error('连接响应无效');
      }
      const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      const response=await fetch('http://127.0.0.1:17321/command',{headers});
      if(!response.ok)throw new Error('连接已更新');
      const task=await response.json();
      if(task.id && task.id!==lastId) {
        lastId=task.id;status.textContent=`执行：${task.command}`;
        let result,error;
        try {result=await execute(task.command,task.args);}catch(e){error=e.message;}
        const sent=await fetch('http://127.0.0.1:17321/result',{method:'POST',headers,body:JSON.stringify({id:task.id,result,error})});
        if(!sent.ok)throw new Error('应用未接收结果');
        status.textContent=error||`完成：${task.command}，等待下一个命令…`;
      }
    }catch{token='';status.textContent='等待 X Schedule 作业任务…（自动连接，无需配对码）';}
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  if(tabId&&!staged&&!recoveredTab)await chrome.tabs.remove(tabId).catch(()=>{});
  tabId=null;staged=false;uploadContext=null;submissionAttempted=false;pendingConfirmation=false;recoveredTab=false;loopActive=false;
};
document.querySelector('#start').click();
