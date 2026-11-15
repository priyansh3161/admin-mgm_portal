    import { createStaffClient } from './supabase-config.js';
    import { getCloudinaryUploadSignature, uploadSignedCloudinaryFile } from './cloudinary-upload.js';
    const supabase = createStaffClient();
    const branches = ['Computer Science & Engineering','Information Technology','Electronics & Communication','Electrical Engineering','Mechanical Engineering','Civil Engineering','Other'];
    const years = ['1st Year','2nd Year','3rd Year','4th Year'];
    const $ = id => document.getElementById(id);
    const state = { user:null, role:null, subjects:[], chapters:[], assignments:[], notices:[], pyqs:[], resourceRequests:[], confessionRequests:[] };
    function options(select,items,placeholder,includeAll=false){
      select.innerHTML='<option value="">'+placeholder+'</option>'+(includeAll?'<option value="__all">All students</option>':'')+items.map(v=>'<option value="'+htmlText(v)+'">'+htmlText(v)+'</option>').join('');
    }
    options($('subjectBranch'),branches,'Choose branch');
    options($('subjectYear'),years,'Choose year');
    options($('noticeBranch'),branches,'All branches',true);
    options($('noticeYear'),years,'All years',true);
    options($('subjectSemester'),Array.from({length:8},(_,i)=>String(i+1)),'Choose semester');
    $('subjectSemester').querySelectorAll('option:not(:first-child)').forEach(o=>o.textContent='Semester '+o.value);

    function htmlText(value){
      return String(value ?? '').replace(/[&<>"']/g, ch => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;');
    }
    function safeResourceUrl(value){
      try { const url=new URL(String(value||'')); const parts=url.pathname.split('/').filter(Boolean); return url.protocol==='https:'&&url.hostname==='res.cloudinary.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&parts[0]==='n4yrq0td'&&['image','raw'].includes(parts[1])&&parts[2]==='upload'&&!parts.some(part=>part==='.'||part==='..')?url.href:''; } catch { return ''; }
    }
    async function loadResourceRequests(){
      if(state.role!=='admin') return;
      const list=$('resourceRequestsList'); message('resourceRequestsStatus','Loading pending uploads...');
      try{
        const {data,error}=await supabase.functions.invoke('elibrary-resources',{body:{action:'list_pending'}});
        if(error)throw error;if(data?.error)throw new Error(data.error);
        const pending=data?.requests||[];
        state.resourceRequests=pending;
        if(!pending.length){list.innerHTML='<div class="resource-empty">No pending E-Library uploads.</div>';message('resourceRequestsStatus','');return;}
        list.innerHTML=pending.map(item=>{const title=htmlText(item.title||'Untitled resource'),author=htmlText(item.author||'Student Contributor'),category=htmlText(item.category||'Notes'),url=safeResourceUrl(item.link);return '<article class="resource-request"><div><strong>'+title+'</strong><p>'+author+' Â· '+category+'</p>'+(url?'<a href="'+htmlText(url)+'" target="_blank" rel="noopener">Review uploaded file</a>':'<p>File link is invalid or unavailable.</p>')+'</div><div class="record-actions"><button type="button" data-approve-resource="'+htmlText(item.id)+'">Accept</button><button type="button" data-reject-resource="'+htmlText(item.id)+'">Reject</button></div></article>';}).join('');
        list.querySelectorAll('[data-approve-resource]').forEach(button=>button.addEventListener('click',()=>reviewResource(button.dataset.approveResource,true,button)));
        list.querySelectorAll('[data-reject-resource]').forEach(button=>button.addEventListener('click',()=>reviewResource(button.dataset.rejectResource,false,button)));
        message('resourceRequestsStatus',pending.length+' pending upload'+(pending.length===1?'':'s')+'.');
      }catch(error){list.innerHTML='<div class="resource-empty">Could not load E-Library requests.</div>';message('resourceRequestsStatus',error.message||String(error),true);}
    }
    function safeConfessionMediaUrl(value){
      try{const url=new URL(String(value||''));return url.protocol==='https:'&&url.hostname==='res.cloudinary.com'&&url.pathname.startsWith('/jgkwrktm/')&&!url.username&&!url.password?url.href:'';}catch{return '';}
    }
    async function loadConfessionRequests(){
      if(!['admin','subadmin'].includes(state.role))return;
      const list=$('confessionRequestsList');message('confessionRequestsStatus','Loading pending confessions...');
      try{
        const {data,error}=await supabase.functions.invoke('admin-moderation',{body:{action:'list_confession_requests'}});
        if(error)throw error;if(data?.error)throw new Error(data.error);
        state.confessionRequests=data?.requests||[];
        if(!state.confessionRequests.length){list.innerHTML='<div class="resource-empty">No pending confessions.</div>';message('confessionRequestsStatus','');return;}
        list.innerHTML=state.confessionRequests.map(post=>{const media=safeConfessionMediaUrl(post.media_url),body=htmlText(post.body||'Attachment only'),tag=htmlText(post.tag||'Confession'),created=htmlText(post.created_at?new Date(post.created_at).toLocaleString():'');return '<article class="record-row"><div><strong>'+tag+' Â· '+created+'</strong><p style="white-space:pre-wrap">'+body+'</p>'+(media?'<p><a href="'+htmlText(media)+'" target="_blank" rel="noopener">Review attachment</a></p>':'')+'</div><div class="record-actions"><button type="button" data-approve-confession="'+htmlText(post.id)+'">Accept</button><button type="button" class="delete-record" data-reject-confession="'+htmlText(post.id)+'">Decline &amp; delete</button></div></article>';}).join('');
        list.querySelectorAll('[data-approve-confession]').forEach(button=>button.addEventListener('click',()=>reviewConfession(button.dataset.approveConfession,true,button)));
        list.querySelectorAll('[data-reject-confession]').forEach(button=>button.addEventListener('click',()=>reviewConfession(button.dataset.rejectConfession,false,button)));
        message('confessionRequestsStatus',state.confessionRequests.length+' pending confession'+(state.confessionRequests.length===1?'':'s')+'.');
      }catch(error){list.innerHTML='<div class="resource-empty">Could not load confession requests.</div>';message('confessionRequestsStatus',error.message||String(error),true);}
    }
    async function reviewConfession(id,approve,button){
      if(!['admin','subadmin'].includes(state.role)||!id)return;
      button.disabled=true;
      try{
        const action=approve?'approve_confession':'reject_confession';
        const {data,error}=await supabase.functions.invoke('admin-moderation',{body:{action,post_id:id}});
        if(error)throw error;if(data?.error)throw new Error(data.error);
        toast(approve?'Confession accepted and published.':'Confession declined and deleted.');
        await loadConfessionRequests();
      }catch(error){button.disabled=false;message('confessionRequestsStatus',error.message||String(error),true);}
    }
    async function reviewResource(id,approve,button){
      if(state.role!=='admin'||!id)return;
      button.disabled=true;
      try{
        const {data,error}=await supabase.functions.invoke('elibrary-resources',{body:{action:approve?'approve':'reject',id}});
        if(error)throw error;if(data?.error)throw new Error(data.error);
        toast(approve?'Resource accepted and published.':'Request rejected and removed.');
        await loadResourceRequests();
      }catch(error){button.disabled=false;message('resourceRequestsStatus',error.message||String(error),true);}
    }
    function message(id,text,error=false){$(id).textContent=text;$(id).style.color=error?'#c0392b':'';}
    function showStaffLogin(text='',error=false){$('adminApp').hidden=true;$('staffLogin').hidden=false;message('staffLoginStatus',text,error);}
    function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3200);}
    function cancelEdit(formId,idField,submitId,cancelId,defaultLabel){
      $(formId).reset();$(idField).value='';$(submitId).textContent=defaultLabel;$(cancelId).hidden=true;
      if(formId==='chapterForm')syncChapterNotesClear();
    }
    function syncChapterNotesClear(){ $('chapterNotesClear').hidden=!$('chapterNotes').files.length; }
    async function upload(file,kind,progress=false,allowSubadmin=false){
      if(!file)return null;
      const resourceType=kind==='video'?'video':'auto';
      if(resourceType==='video'&&file.size>100*1024*1024){
        const sizeMiB=(file.size/1024/1024).toFixed(1);
        throw new Error('â€œ'+file.name+'â€ is '+sizeMiB+' MiB. Cloudinary upload limit is 100 MiB. Use a public video URL or increase the account/preset limit.');
      }
      const bar=$('uploadProgress');
      if(progress){bar.style.display='block';bar.firstElementChild.style.width='0';}
      try{
        const signature=await getCloudinaryUploadSignature(supabase,{purpose:allowSubadmin?'academic_publication':'academic_content',resource_type:resourceType});
        const data=await uploadSignedCloudinaryFile(signature,file,{onProgress:progress?percent=>{bar.firstElementChild.style.width=percent+'%';}:undefined});
        if(!data.secure_url)throw new Error('Cloudinary returned no secure URL for '+file.name+'.');
        return {url:data.secure_url,publicId:data.public_id};
      }finally{if(progress){bar.style.display='none';bar.firstElementChild.style.width='0';}}
    }
    function normalizeVideoUrl(value){
      if(!value)return '';
      let url;try{url=new URL(value);}catch{throw new Error('Enter a valid video URL.');}
      if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use a secure HTTPS video URL.');
      if(url.hostname==='huggingface.co'||url.hostname==='www.huggingface.co'){
        const parts=url.pathname.split('/');const blobIndex=parts.indexOf('blob');
        if(blobIndex!==-1){parts[blobIndex]='resolve';url.pathname=parts.join('/');url.search='?download=true';}
      }
      return url.href;
    }
    function normalizeOptionalHttpsUrl(value,label){
      if(!value)return null;
      let url;try{url=new URL(value);}catch{throw new Error('Enter a valid '+label+' URL.');}
      if(url.protocol!=='https:'||url.username||url.password)throw new Error(label+' must be a secure HTTPS URL.');
      return url.href;
    }
    function normalizeOdyseeEmbedUrl(value,label){
      if(!value)return null;
      const normalized=normalizeOptionalHttpsUrl(value,label),url=new URL(normalized);
      const parts=url.pathname.split('/').filter(Boolean);
      if(!['odysee.com','www.odysee.com'].includes(url.hostname.toLowerCase())||parts[0]!=='$'||parts[1]!=='embed'||parts.length<3)
        throw new Error(label+' must be an Odysee embed URL copied from Share → Embed.');
      return url.href;
    }
    function readChapterVideo(value,odyseeColumn){
      if(typeof value!=='string')return {primary:'',odysee:odyseeColumn||''};
      try{
        const parsed=JSON.parse(value);
        if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
          const sources=parsed.sources||parsed.qualities;
          const sourceList=Array.isArray(sources)?sources:(sources&&typeof sources==='object'?Object.entries(sources).map(([label,item])=>typeof item==='string'?{label,url:item}:{label,...item}):[]);
          const primary=sourceList[0]?.url||(!sources?value:'');
          return {primary,odysee:odyseeColumn||parsed.fallback?.odyseeEmbed||parsed.odyseeEmbed||''};
        }
        if(Array.isArray(parsed))return {primary:parsed[0]?.url||parsed[0]||'',odysee:odyseeColumn||''};
      }catch{}
      return {primary:value,odysee:odyseeColumn||''};
    }
    async function saveRecord(table,payload,id,status,label){
      message(status,'Savingâ€¦');
      const result=id?await supabase.from(table).update(payload).eq('id',id).select('id').maybeSingle():await supabase.from(table).insert(payload);
      if(result.error)throw result.error;
      if(id&&!result.data)throw new Error('No row was updated. Check staff permissions or reload the record list.');
      message(status,id?label+' updated.':label+' published.');
      toast(id?label+' updated':label+' published');
    }
    async function deleteRecord(table,id,label,reload,warning){
      if(!window.confirm(warning||'Delete this '+label.toLowerCase()+' permanently?'))return;
      try{
        const {data,error}=await supabase.from(table).delete().eq('id',id).select('id').maybeSingle();
        if(error)throw error;
        if(!data)throw new Error('No row was deleted. Check staff permissions or reload the record list.');
        toast(label+' deleted.');
        await reload();
      }catch(error){toast('Unable to delete '+label.toLowerCase()+': '+(error.message||error));}
    }
    function actionButtons(id,editAttribute,deleteAttribute){
      return '<div class="record-actions"><button type="button" data-'+editAttribute+'="'+htmlText(id)+'">Edit</button><button type="button" class="delete-record" data-'+deleteAttribute+'="'+htmlText(id)+'">Delete</button></div>';
    }
    function renderSubjectRecords(){
      const query=($('subjectSearch')?.value||'').trim().toLowerCase();
      const subjects=state.subjects.filter(subject=>!query||[subject.name,subject.code,subject.branch,subject.year,subject.semester]
        .some(value=>String(value||'').toLowerCase().includes(query)));
      $('subjectRecords').innerHTML=subjects.map(subject=>'<article class="record-row"><div><strong>'+htmlText(subject.name)+' Â· '+htmlText(subject.code)+'</strong><p>'+htmlText(subject.branch)+' Â· '+htmlText(subject.year)+' Â· Semester '+htmlText(subject.semester||'â€”')+'</p></div>'+actionButtons(subject.id,'edit-subject','delete-subject')+'</article>').join('')||(query?'<p class="hint">No subjects match your search.</p>':'<p class="hint">No subjects yet.</p>');
    }
    function subjectOptionLabel(subject){
      return subject.name+' Â· '+subject.code+' Â· '+subject.year+' Â· '+subject.branch;
    }
    function renderChapterSubjectOptions(){
      const select=$('chapterSubject'),picker=$('chapterSubjectSearch'),selected=select.value;
      $('chapterSubjectOptions').innerHTML=state.subjects.map(subject=>'<option value="'+htmlText(subjectOptionLabel(subject))+'"></option>').join('');
      const selectedSubject=state.subjects.find(subject=>subject.id===selected);
      if(selectedSubject)picker.value=subjectOptionLabel(selectedSubject);
      syncChapterSubjectPicker();
    }
    function syncChapterSubjectPicker(){
      const picker=$('chapterSubjectSearch'),select=$('chapterSubject');
      const selected=state.subjects.find(subject=>subjectOptionLabel(subject)===picker.value);
      select.value=selected?.id||'';
      picker.setCustomValidity(selected?'':'Choose a subject from the suggestions.');
    }
    async function refreshSubjects(){
      const {data,error}=await supabase.from('academic_subjects').select('id,name,code,branch,year,semester').order('name');
      if(error)throw error;
      state.subjects=data||[];
      for(const id of ['chapterSubject','assignmentSubject','pyqSubject']){
        const select=$(id),previous=select.value;
        select.innerHTML='<option value="">Choose subject</option>'+state.subjects.map(s=>'<option value="'+htmlText(s.id)+'">'+htmlText(s.name)+' Â· '+htmlText(s.code)+' Â· '+htmlText(s.year)+' Â· '+htmlText(s.branch)+'</option>').join('');
        if(state.subjects.some(s=>s.id===previous))select.value=previous;
      }
      renderChapterSubjectOptions();
      renderSubjectRecords();
    }
    function renderManagedRecords(){
      $('assignmentRecords').innerHTML=state.assignments.map(a=>{
        const subject=state.subjects.find(s=>s.id===a.subject_id);
        return '<article class="record-row"><div><strong>'+htmlText(a.title)+'</strong><p>'+htmlText(subject?.name||'Class assignment')+' Â· Due '+(a.due_at?htmlText(new Date(a.due_at).toLocaleString()):'not set')+'</p></div>'+actionButtons(a.id,'edit-assignment','delete-assignment')+'</article>';
      }).join('')||'<p class="hint">No assignments yet.</p>';
      $('noticeRecords').innerHTML=state.notices.map(n=>'<article class="record-row"><div><strong>'+htmlText(n.title)+'</strong><p>'+htmlText(n.category||'General')+' Â· '+htmlText(n.branch||'All branches')+' Â· '+htmlText(n.year||'All years')+'</p></div>'+actionButtons(n.id,'edit-notice','delete-notice')+'</article>').join('')||'<p class="hint">No notices yet.</p>';
      if(state.role==='admin'){
        const query=($('chapterSearch')?.value||'').trim().toLowerCase();
        const filteredChapters=state.chapters.filter(c=>{
          if(!query)return true;
          const subject=state.subjects.find(s=>s.id===c.subject_id);
          return [c.title,c.chapter_order,subject?.name,subject?.code,c.video_url,c.notes_url,c.notes_url_2,c.practice_url]
            .some(value=>String(value||'').toLowerCase().includes(query));
        });
        $('chapterRecords').innerHTML=filteredChapters.map(c=>{
          const subject=state.subjects.find(s=>s.id===c.subject_id);
          const links=[c.video_url?'Video':'',c.notes_url?'Notes':'',c.notes_url_2?'Notes Link 2':'',c.practice_url?'Link: '+c.practice_url:''].filter(Boolean).join(' Â· ')||'No media or links';
          return '<article class="record-row"><div><strong>'+htmlText(c.chapter_order||'')+(c.chapter_order?'. ':'')+htmlText(c.title)+'</strong><p>'+htmlText(subject?.name||'Unknown subject')+' Â· '+htmlText(links)+'</p></div>'+actionButtons(c.id,'edit-chapter','delete-chapter')+'</article>';
        }).join('')||(query?'<p class="hint">No chapters match your search.</p>':'<p class="hint">No chapters or links yet.</p>');
        $('pyqRecords').innerHTML=state.pyqs.map(p=>{
          const subject=state.subjects.find(s=>s.id===p.subject_id);
          return '<article class="record-row"><div><strong>'+htmlText(p.title||p.file_name||'Question paper')+'</strong><p>'+htmlText(subject?.name||'Unknown subject')+' Â· '+htmlText(p.exam_year||'Year not set')+' Â· '+htmlText(p.file_name||'PDF attached')+'</p></div>'+actionButtons(p.id,'edit-pyq','delete-pyq')+'</article>';
        }).join('')||'<p class="hint">No PYQs yet.</p>';
      }
    }
    async function loadManagedRecords(){
      const [assignments,notices]=await Promise.all([
        supabase.from('academic_assignments').select('*').order('created_at',{ascending:false}),
        supabase.from('academic_notices').select('*').order('created_at',{ascending:false})
      ]);
      if(assignments.error)throw assignments.error;
      if(notices.error)throw notices.error;
      state.assignments=assignments.data||[];state.notices=notices.data||[];
      if(state.role==='admin'){
        const [chapters,pyqs]=await Promise.all([
          supabase.from('academic_chapters').select('*').order('chapter_order'),
          supabase.from('academic_pyqs').select('*').order('exam_year',{ascending:false})
        ]);
        if(chapters.error)throw chapters.error;
        if(pyqs.error)throw pyqs.error;
        state.chapters=chapters.data||[];state.pyqs=pyqs.data||[];
      }
      renderManagedRecords();
    }
    function dateTimeLocal(value){
      if(!value)return '';
      const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);
    }

    $('tabs').addEventListener('click',e=>{
      const button=e.target.closest('.tab');if(!button)return;
      document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('active',item===button));
      document.querySelectorAll('.panel').forEach(panel=>panel.classList.toggle('active',panel.id===button.dataset.panel));
    });

    $('subjectForm').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('subjectSubmit');button.disabled=true;
      try{
        const id=$('subjectId').value;
        const payload={name:$('subjectName').value.trim(),code:$('subjectCode').value.trim().toUpperCase(),branch:$('subjectBranch').value,year:$('subjectYear').value,semester:Number($('subjectSemester').value)};
        await saveRecord('academic_subjects',payload,id,'subjectStatus','Subject');
        cancelEdit('subjectForm','subjectId','subjectSubmit','subjectCancel','Create subject');
        await refreshSubjects();await loadManagedRecords();
      }catch(error){message('subjectStatus',error.message||String(error),true);}
      finally{button.disabled=false;}
    });
    $('subjectCancel').addEventListener('click',()=>cancelEdit('subjectForm','subjectId','subjectSubmit','subjectCancel','Create subject'));
    $('subjectSearch').addEventListener('input',renderSubjectRecords);
    $('chapterSubjectSearch').addEventListener('input',syncChapterSubjectPicker);
    $('chapterSubjectSearch').addEventListener('change',syncChapterSubjectPicker);
    $('subjectRecords').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-subject]');
      if(edit){
        const subject=state.subjects.find(item=>item.id===edit.dataset.editSubject);if(!subject)return;
        $('subjectId').value=subject.id;$('subjectName').value=subject.name||'';$('subjectCode').value=subject.code||'';
        $('subjectBranch').value=subject.branch||'';$('subjectYear').value=subject.year||'';$('subjectSemester').value=String(subject.semester||'');
        $('subjectSubmit').textContent='Save subject';$('subjectCancel').hidden=false;$('subjectForm').scrollIntoView({behavior:'smooth',block:'start'});return;
      }
      const remove=event.target.closest('[data-delete-subject]');if(!remove)return;
      const subject=state.subjects.find(item=>item.id===remove.dataset.deleteSubject);if(!subject)return;
      void deleteRecord('academic_subjects',subject.id,'Subject',async()=>{await refreshSubjects();await loadManagedRecords();},'Delete â€œ'+subject.name+'â€? Linked chapters, assignments or PYQs may also be removed, depending on the database relationships.');
    });

    $('chapterForm').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('chapterSubmit');button.disabled=true;
      try{
        const id=$('chapterId').value,existing=state.chapters.find(item=>item.id===id);
        const videoFile=$('chapterVideo').files[0],videoUrl=normalizeVideoUrl($('chapterVideoUrl').value.trim());
        if(videoFile&&videoUrl)throw new Error('Choose either a video file or a video URL, not both.');
        const odyseeVideo=normalizeOdyseeEmbedUrl($('chapterVideoOdysee').value.trim(),'Odysee video fallback');
        const video=await upload(videoFile,'video',true),notesFile=$('chapterNotes').files[0];
        const notesUrl2=normalizeOptionalHttpsUrl($('chapterNotesUrl2').value.trim(),'Notes Link 2');
        let notes=null,notesUploadError=null;
        if(notesFile){try{notes=await upload(notesFile,'auto');}catch(error){notesUploadError=error;}}
        if(notesUploadError&&!notesUrl2)throw notesUploadError;
        const priorVideo=readChapterVideo(existing?.video_url,existing?.video_odysee_url);
        const primaryVideoUrl=video?.url||videoUrl||null;
        const notesPrimaryUrl=notesUploadError?notesUrl2:(notes?.url||existing?.notes_url||notesUrl2||null);
        const notesSecondaryUrl=notesUploadError?null:(notesUrl2&&notesUrl2!==notesPrimaryUrl?notesUrl2:(existing?.notes_url_2||null));
        const payload={
          subject_id:$('chapterSubject').value,title:$('chapterTitle').value.trim(),description:$('chapterDescription').value.trim(),
          video_url:primaryVideoUrl,video_odysee_url:odyseeVideo,video_public_id:video?.publicId||(primaryVideoUrl===priorVideo.primary?existing?.video_public_id:null),
          notes_url:notesPrimaryUrl,notes_url_2:notesSecondaryUrl,
          notes_name:notes?.url?notesFile.name:(notesUploadError?null:(existing?.notes_name||null)),
          practice_url:$('chapterPractice').value.trim()||null,chapter_order:Number($('chapterOrder').value)||0
        };
        await saveRecord('academic_chapters',payload,id,'chapterStatus','Chapter');
        if(notesUploadError)message('chapterStatus','Cloudinary upload failed; Notes Link 2 was saved as Notes.');
        cancelEdit('chapterForm','chapterId','chapterSubmit','chapterCancel','Add chapter');
        await loadManagedRecords();
      }catch(error){message('chapterStatus',error.message||String(error),true);}
      finally{button.disabled=false;}
    });
    $('chapterCancel').addEventListener('click',()=>cancelEdit('chapterForm','chapterId','chapterSubmit','chapterCancel','Add chapter'));
    $('chapterNotes').addEventListener('change',syncChapterNotesClear);
    $('chapterNotesClear').addEventListener('click',()=>{
      $('chapterNotes').value='';syncChapterNotesClear();message('chapterStatus','');
    });
    $('chapterSearch').addEventListener('input',()=>renderManagedRecords());
    $('chapterRecords').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-chapter]');
      if(edit){
        const chapter=state.chapters.find(item=>item.id===edit.dataset.editChapter);if(!chapter)return;
        $('chapterId').value=chapter.id;$('chapterSubject').value=chapter.subject_id||'';$('chapterTitle').value=chapter.title||'';
        $('chapterOrder').value=chapter.chapter_order||1;$('chapterDescription').value=chapter.description||'';
        const chapterSubject=state.subjects.find(subject=>subject.id===chapter.subject_id);
        $('chapterSubjectSearch').value=chapterSubject?subjectOptionLabel(chapterSubject):'';syncChapterSubjectPicker();
        const videoData=readChapterVideo(chapter.video_url,chapter.video_odysee_url);
        $('chapterVideoUrl').value=videoData.primary;$('chapterVideoOdysee').value=videoData.odysee;$('chapterPractice').value=chapter.practice_url||'';$('chapterNotesUrl2').value=chapter.notes_url_2||'';
        $('chapterSubmit').textContent='Save chapter';$('chapterCancel').hidden=false;$('chapterForm').scrollIntoView({behavior:'smooth',block:'start'});return;
      }
      const remove=event.target.closest('[data-delete-chapter]');if(!remove)return;
      const chapter=state.chapters.find(item=>item.id===remove.dataset.deleteChapter);if(!chapter)return;
      void deleteRecord('academic_chapters',chapter.id,'Chapter and links',loadManagedRecords,'Delete this chapter and its database links? Uploaded Cloudinary files may remain in storage.');
    });

    $('assignmentForm').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('assignmentSubmit');button.disabled=true;
      try{
        const subject=state.subjects.find(item=>item.id===$('assignmentSubject').value);if(!subject)throw new Error('Choose a subject.');
        const id=$('assignmentId').value,existing=state.assignments.find(item=>item.id===id),file=await upload($('assignmentFile').files[0],'auto',false,true);
        const payload={subject_id:subject.id,title:$('assignmentTitle').value.trim(),description:$('assignmentDescription').value.trim(),branch:subject.branch,year:subject.year,due_at:new Date($('assignmentDue').value).toISOString(),file_url:file?.url||existing?.file_url||null,file_name:file?.url?$('assignmentFile').files[0].name:existing?.file_name||null};
        await saveRecord('academic_assignments',payload,id,'assignmentStatus','Assignment');
        cancelEdit('assignmentForm','assignmentId','assignmentSubmit','assignmentCancel','Publish assignment');await loadManagedRecords();
      }catch(error){message('assignmentStatus',error.message||String(error),true);}
      finally{button.disabled=false;}
    });
    $('assignmentCancel').addEventListener('click',()=>cancelEdit('assignmentForm','assignmentId','assignmentSubmit','assignmentCancel','Publish assignment'));
    $('assignmentRecords').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-assignment]');
      if(edit){
        const item=state.assignments.find(row=>row.id===edit.dataset.editAssignment);if(!item)return;
        $('assignmentId').value=item.id;$('assignmentSubject').value=item.subject_id||'';$('assignmentTitle').value=item.title||'';
        $('assignmentDescription').value=item.description||'';$('assignmentDue').value=dateTimeLocal(item.due_at);
        $('assignmentSubmit').textContent='Save assignment';$('assignmentCancel').hidden=false;$('assignmentForm').scrollIntoView({behavior:'smooth',block:'start'});return;
      }
      const remove=event.target.closest('[data-delete-assignment]');if(!remove)return;
      void deleteRecord('academic_assignments',remove.dataset.deleteAssignment,'Assignment',loadManagedRecords,'Delete this assignment? Its uploaded file may remain in Cloudinary.');
    });

    $('noticeForm').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('noticeSubmit');button.disabled=true;
      try{
        const id=$('noticeId').value,existing=state.notices.find(item=>item.id===id),file=await upload($('noticeFile').files[0],'auto',false,true);
        const payload={title:$('noticeTitle').value.trim(),body:$('noticeBody').value.trim(),category:$('noticeCategory').value,branch:$('noticeBranch').value==='__all'?null:$('noticeBranch').value||null,year:$('noticeYear').value==='__all'?null:$('noticeYear').value||null,file_url:file?.url||existing?.file_url||null,file_name:file?.url?$('noticeFile').files[0].name:existing?.file_name||null};
        await saveRecord('academic_notices',payload,id,'noticeStatus','Notice');
        cancelEdit('noticeForm','noticeId','noticeSubmit','noticeCancel','Publish notice');await loadManagedRecords();
      }catch(error){message('noticeStatus',error.message||String(error),true);}
      finally{button.disabled=false;}
    });
    $('noticeCancel').addEventListener('click',()=>cancelEdit('noticeForm','noticeId','noticeSubmit','noticeCancel','Publish notice'));
    $('noticeRecords').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-notice]');
      if(edit){
        const item=state.notices.find(row=>row.id===edit.dataset.editNotice);if(!item)return;
        $('noticeId').value=item.id;$('noticeTitle').value=item.title||'';$('noticeCategory').value=item.category||'general';
        $('noticeBranch').value=item.branch||'__all';$('noticeYear').value=item.year||'__all';$('noticeBody').value=item.body||'';
        $('noticeSubmit').textContent='Save notice';$('noticeCancel').hidden=false;$('noticeForm').scrollIntoView({behavior:'smooth',block:'start'});return;
      }
      const remove=event.target.closest('[data-delete-notice]');if(!remove)return;
      void deleteRecord('academic_notices',remove.dataset.deleteNotice,'Notice',loadManagedRecords,'Delete this notice? Its attachment may remain in Cloudinary.');
    });

    $('pyqForm').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('pyqSubmit');button.disabled=true;
      try{
        const subject=state.subjects.find(item=>item.id===$('pyqSubject').value);if(!subject)throw new Error('Choose a subject.');
        const id=$('pyqId').value,existing=state.pyqs.find(item=>item.id===id),file=await upload($('pyqFile').files[0],'auto');
        if(!file&&!existing?.file_url)throw new Error('Choose a question paper PDF.');
        const payload={subject_id:subject.id,title:$('pyqTitle').value.trim(),exam_year:Number($('pyqExamYear').value),branch:subject.branch,year:subject.year,file_url:file?.url||existing?.file_url,file_name:file?.url?$('pyqFile').files[0].name:existing?.file_name};
        await saveRecord('academic_pyqs',payload,id,'pyqStatus','PYQ');
        cancelEdit('pyqForm','pyqId','pyqSubmit','pyqCancel','Add PYQ');await loadManagedRecords();
      }catch(error){message('pyqStatus',error.message||String(error),true);}
      finally{button.disabled=false;}
    });
    $('pyqCancel').addEventListener('click',()=>cancelEdit('pyqForm','pyqId','pyqSubmit','pyqCancel','Add PYQ'));
    $('pyqRecords').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-pyq]');
      if(edit){
        const item=state.pyqs.find(row=>row.id===edit.dataset.editPyq);if(!item)return;
        $('pyqId').value=item.id;$('pyqSubject').value=item.subject_id||'';$('pyqExamYear').value=item.exam_year||'';
        $('pyqTitle').value=item.title||'';$('pyqSubmit').textContent='Save PYQ';$('pyqCancel').hidden=false;
        $('pyqForm').scrollIntoView({behavior:'smooth',block:'start'});return;
      }
      const remove=event.target.closest('[data-delete-pyq]');if(!remove)return;
      void deleteRecord('academic_pyqs',remove.dataset.deletePyq,'PYQ',loadManagedRecords,'Delete this PYQ record? The uploaded file may remain in Cloudinary.');
    });

    $('staffForm').addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        const {error}=await supabase.from('academic_staff').upsert({user_id:$('staffUserId').value.trim(),role:$('staffRole').value});
        if(error)throw error;message('staffStatus','Access updated.');e.target.reset();await loadStaff();
      }catch(error){message('staffStatus',error.message||String(error),true);}
    });
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    async function moderationAction(action,payload,statusId){
      if(state.role!=='admin')throw new Error('Only a primary admin can moderate users or posts.');
      const {data,error}=await supabase.functions.invoke('admin-moderation',{body:{action,...payload}});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      message(statusId,data?.message||'Moderation action completed.');
    }
    $('moderationBanForm').addEventListener('submit',async e=>{
      e.preventDefault();const id=$('moderationUserId').value.trim(),duration=$('moderationDuration').value;
      if(!uuidPattern.test(id))return message('moderationStatus','Enter a valid user UUID.',true);
      if(!await window.confirm(`Block new sign-ins for this account ${duration==='permanent'?'until an admin lifts it':`for ${duration}`}? Existing sessions may continue until their access tokens expire.`))return;
      message('moderationStatus','Applying account restrictionâ€¦');
      try{await moderationAction('ban_user',{user_id:id,duration},'moderationStatus');}
      catch(error){message('moderationStatus',error.message||String(error),true);}
    });
    $('moderationUnban').addEventListener('click',async()=>{
      const id=$('moderationUserId').value.trim();if(!uuidPattern.test(id))return message('moderationStatus','Enter a valid user UUID first.',true);
      if(!await window.confirm('Lift the sign-in restriction for this account?'))return;
      message('moderationStatus','Lifting account restrictionâ€¦');
      try{await moderationAction('unban_user',{user_id:id},'moderationStatus');}
      catch(error){message('moderationStatus',error.message||String(error),true);}
    });
    $('moderationPostForm').addEventListener('submit',async e=>{
      e.preventDefault();const input=$('moderationPostId').value.trim();
      const match=input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      const id=match?.[0];
      if(!id)return message('moderationPostStatus','Paste a valid confession share link or post UUID.',true);
      if(!await window.confirm('Permanently delete this confession post?'))return;
      message('moderationPostStatus','Deleting confessionâ€¦');
      try{await moderationAction('delete_confession',{post_id:id},'moderationPostStatus');e.target.reset();}
      catch(error){message('moderationPostStatus',error.message||String(error),true);}
    });
    async function loadStaff(){
      const {data,error}=await supabase.from('academic_staff').select('user_id,role,created_at').order('created_at');
      if(error)throw error;
      $('staffList').innerHTML=(data||[]).map(s=>'<div class="staff-item"><span>'+htmlText(s.user_id)+'</span><strong>'+htmlText(s.role)+'</strong></div>').join('')||'<p class="hint">No staff records.</p>';
    }
    async function init(){
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){showStaffLogin();return;}
      state.user=session.user;
      const {data:staff,error}=await supabase.from('academic_staff').select('role').eq('user_id',session.user.id).maybeSingle();
      if(error||!staff||!['admin','subadmin'].includes(staff.role)){await supabase.auth.signOut();showStaffLogin('This account is not approved for academic staff access.',true);return;}
      $('staffLogin').hidden=true;$('adminApp').hidden=false;state.role=staff.role;
      const isAdmin=staff.role==='admin';
      $('roleBadge').textContent=isAdmin?'Primary admin':'Subadmin';
      $('roleDescription').textContent=isAdmin?'Manage academic content, notices, assignments and staff access.':'Publish, edit and delete assignments and notices.';
      document.querySelectorAll('.admin-only').forEach(el=>el.hidden=!isAdmin);
      ['subjectPanel','chapterPanel','pyqPanel','staffPanel','resourceRequestsPanel','moderationPanel'].forEach(id=>$(id).hidden=!isAdmin);
      $('confessionRequestsPanel').hidden=false;
      if(!isAdmin){
        document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.panel==='assignmentPanel'));
        document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id==='assignmentPanel'));
      }
      try{
        await refreshSubjects();await loadManagedRecords();await loadConfessionRequests();if(isAdmin){await loadStaff();await loadResourceRequests();}
        message('managerStatus','');
      }catch(error){message('managerStatus','Could not load all saved entries: '+(error.message||error),true);}
    }
    $('staffLoginForm').addEventListener('submit',async event=>{
      event.preventDefault();const button=$('staffLoginButton');button.disabled=true;message('staffLoginStatus','Checking staff accessâ€¦');
      try{
        const {error}=await supabase.auth.signInWithPassword({email:$('staffEmail').value.trim(),password:$('staffPassword').value});
        if(error)throw error;await init();
      }catch(error){showStaffLogin(error.message||'Sign in failed.',true);}
      finally{button.disabled=false;}
    });
    $('staffLogout').addEventListener('click',async()=>{
      await supabase.auth.signOut();state.user=null;state.role=null;showStaffLogin('Signed out from staff panel.');
    });
    init().catch(error=>showStaffLogin((error.message||error)+'. Confirm the academic_* tables and academic_staff access are configured in Supabase.',true));
