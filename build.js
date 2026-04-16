const fs = require('fs');
const path = require('path');

const buildPy = fs.readFileSync(path.join(__dirname, 'build.py'), 'utf8');

const chapterBlocks = [];
const regex = /chapters\.append\((\{[\s\S]*?\})\)/g;
let match;
while ((match = regex.exec(buildPy)) !== null) {
  let block = match[1].replace(/True/g,'true').replace(/False/g,'false').replace(/None/g,'null');
  chapterBlocks.push(JSON.parse(block));
}

const chaptersJson = JSON.stringify(chapterBlocks);

const CSS = `*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f5f2ed;--ink:#111;--red:#c23a22;--faint:#d5d0c8;--mid:#8a8477;--green:#2e7d4f;--card:#fff;--expl:#f0ece5;--radius:8px}
body{font-family:'Noto Sans JP',sans-serif;background:var(--bg);color:var(--ink);line-height:1.7;min-height:100vh;padding-bottom:80px}
.container{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;font-weight:700;text-align:center;margin:20px 0 4px}
.subtitle{text-align:center;color:var(--mid);font-size:.85rem;margin-bottom:20px}
.stats-bar{display:flex;justify-content:center;gap:12px;margin-bottom:20px;font-size:.82rem;color:var(--mid);flex-wrap:wrap}
.stats-bar span{background:var(--card);padding:5px 12px;border-radius:20px;border:1px solid var(--faint)}
.top-actions{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:var(--radius);font-size:1rem;font-family:inherit;cursor:pointer;text-align:center;font-weight:500;transition:opacity .2s}
.btn:active{opacity:.7}
.btn-primary{background:var(--red);color:#fff}
.btn-secondary{background:var(--card);color:var(--ink);border:1px solid var(--faint)}
.btn-accent{background:var(--green);color:#fff}
.badge{display:inline-block;background:var(--red);color:#fff;font-size:.75rem;padding:1px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}
.chapter-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
@media(min-width:640px){.chapter-grid{grid-template-columns:1fr 1fr 1fr}}
.ch-card{background:var(--card);border-radius:var(--radius);padding:14px;cursor:pointer;border:1px solid var(--faint);transition:box-shadow .2s}
.ch-card:active{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.ch-num{font-size:.75rem;color:var(--mid);font-weight:500}
.ch-name{font-size:.88rem;font-weight:700;margin:4px 0 8px;line-height:1.3}
.progress-track{height:6px;background:var(--faint);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s}
.ch-score{font-size:.73rem;color:var(--mid);margin-top:6px}
.reset-area{text-align:center;margin:20px 0 40px}
.reset-btn{background:none;border:1px solid var(--faint);color:var(--mid);padding:8px 20px;border-radius:var(--radius);font-size:.8rem;cursor:pointer;font-family:inherit}
.quiz-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.back-btn{background:none;border:none;font-size:1.3rem;cursor:pointer;padding:4px 8px}
.quiz-title{font-size:1rem;font-weight:700;flex:1}
.q-counter{font-size:.8rem;color:var(--mid)}
.progress-bar-wrap{margin-bottom:16px}
.q-card{background:var(--card);border-radius:var(--radius);padding:20px;border-left:4px solid var(--red);margin-bottom:12px;position:relative}
.q-card.correct{border-left-color:var(--green)}
.q-card.wrong{border-left-color:var(--red)}
.bookmark-btn{position:absolute;top:12px;right:12px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--faint);transition:color .2s}
.bookmark-btn.active{color:#e6b422}
.q-text{font-size:.95rem;font-weight:500;margin-bottom:16px;padding-right:30px}
.choices{display:flex;flex-direction:column;gap:8px}
.choice-btn{background:var(--bg);border:1.5px solid var(--faint);border-radius:var(--radius);padding:12px 16px;font-size:.88rem;text-align:left;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s;line-height:1.5}
.choice-btn:active{opacity:.8}
.choice-btn.selected{border-color:var(--ink);background:#e8e5df}
.choice-btn.correct-choice{border-color:var(--green);background:#e8f5e9}
.choice-btn.wrong-choice{border-color:var(--red);background:#fdecea}
.choice-btn[disabled]{cursor:default}
.result-icon{display:inline-block;width:20px;font-weight:700;margin-right:2px}
.explanation{background:var(--expl);border-radius:var(--radius);padding:16px;margin-top:12px;font-size:.84rem;line-height:1.8;display:none}
.explanation.show{display:block}
.expl-section{margin-bottom:10px}
.expl-section:last-child{margin-bottom:0}
.expl-label{font-weight:700;font-size:.78rem;margin-bottom:2px}
.expl-label.green{color:var(--green)}
.expl-label.red{color:var(--red)}
.expl-label.blue{color:#2563eb}
.expl-wrong-item{margin-left:8px;padding-left:8px;border-left:2px solid var(--faint);margin-bottom:4px}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--faint);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:100}
.nav-btn{padding:10px 24px;border:1px solid var(--faint);border-radius:var(--radius);background:var(--card);font-family:inherit;font-size:.9rem;cursor:pointer}
.nav-btn:disabled{opacity:.3;cursor:default}
.nav-btn.primary{background:var(--red);color:#fff;border-color:var(--red)}
.nav-center{font-size:.8rem;color:var(--mid)}
.result-card{background:var(--card);border-radius:var(--radius);padding:24px;text-align:center;margin-bottom:16px}
.result-score{font-size:2.5rem;font-weight:700;color:var(--green)}
.result-label{font-size:.9rem;color:var(--mid);margin-top:4px}
.result-list{margin-top:16px;text-align:left}
.result-list-item{padding:10px 12px;border-bottom:1px solid var(--faint);font-size:.84rem}
.result-list-item:hover{background:var(--expl)}
.hidden{display:none!important}
.fade-in{animation:fadeIn .25s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
footer{text-align:center;font-size:.72rem;color:var(--mid);padding:20px 0 40px}`;

const JS = `"use strict";
var CH=defined_chapters;
var LS=localStorage;
var app=document.getElementById("app");
var bnav=document.getElementById("bottomNav");
var prevBtn=document.getElementById("prevBtn");
var nextBtn=document.getElementById("nextBtn");
var navCenter=document.getElementById("navCenter");
var state={screen:"home",chId:null,qIdx:0,questions:[],answers:{},mode:""};

function key(k){return "himq_"+k;}
function load(k,d){try{var v=LS.getItem(key(k));return v?JSON.parse(v):d;}catch(e){return d;}}
function save(k,v){LS.setItem(key(k),JSON.stringify(v));}
function getScore(chId){return load("score_"+chId,{correct:0,total:0});}
function setScore(chId,s){save("score_"+chId,s);}
function getWrong(){return load("wrong",[]);}
function setWrong(w){save("wrong",w);}
function getBookmarks(){return load("bookmarks",[]);}
function setBookmarks(b){save("bookmarks",b);}

function totalQ(){var n=0;CH.forEach(function(c){n+=c.questions.length;});return n;}
function totalCorrect(){var n=0;CH.forEach(function(c){var s=getScore(c.id);n+=s.correct;});return n;}
function totalAttempted(){var n=0;CH.forEach(function(c){var s=getScore(c.id);n+=s.total;});return n;}
function shuffle(arr){var a=arr.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

function getTitle(){
  if(state.mode==="chapter"){var ch=CH.find(function(c){return c.id===state.chId;});return ch?ch.name:"";}
  if(state.mode==="random") return "\\u5168\\u7ae0\\u30e9\\u30f3\\u30c0\\u30e0 20\\u554f";
  if(state.mode==="wrong") return "\\u9593\\u9055\\u3048\\u305f\\u554f\\u984c\\u306e\\u5fa9\\u7fd2";
  if(state.mode==="bookmark") return "\\u30d6\\u30c3\\u30af\\u30de\\u30fc\\u30af";
  return "";
}

function renderHome(){
  state.screen="home";bnav.classList.add("hidden");
  var tq=totalQ(),tc=totalCorrect(),ta=totalAttempted();
  var acc=ta>0?Math.round(tc/ta*100):0;
  var wrongCount=getWrong().length;
  var bmCount=getBookmarks().length;
  var h='<h1>\\u8a3a\\u7642\\u60c5\\u5831\\u7ba1\\u7406\\u58eb \\u6a21\\u64ec\\u554f\\u984c\\u96c6</h1>';
  h+='<div class="subtitle">\\u516812\\u7ae0 \\u5b8c\\u5168\\u5bfe\\u5fdc\\u7248\\u30fb\\u5168'+tq+'\\u554f</div>';
  h+='<div class="stats-bar"><span>\\u7dcf\\u554f\\u984c\\u6570: '+tq+'</span><span>\\u6b63\\u89e3: '+tc+'</span><span>\\u6b63\\u7b54\\u7387: '+acc+'%</span></div>';
  h+='<div class="top-actions">';
  h+='<button class="btn btn-primary" onclick="startRandom()">\\u5168\\u7ae0\\u30e9\\u30f3\\u30c0\\u30e0 20\\u554f</button>';
  h+='<button class="btn btn-secondary" onclick="startWrongReview()">\\u9593\\u9055\\u3048\\u305f\\u554f\\u984c\\u3092\\u5fa9\\u7fd2';
  if(wrongCount>0) h+='<span class="badge">'+wrongCount+'</span>';
  h+='</button>';
  h+='<button class="btn btn-secondary" onclick="startBookmarkReview()">\\u30d6\\u30c3\\u30af\\u30de\\u30fc\\u30af';
  if(bmCount>0) h+='<span class="badge">'+bmCount+'</span>';
  h+='</button></div>';
  h+='<div class="chapter-grid">';
  CH.forEach(function(ch){
    var s=getScore(ch.id);var pct=ch.questions.length>0?Math.round(s.correct/ch.questions.length*100):0;
    h+='<div class="ch-card" onclick="startChapter('+ch.id+')">';
    h+='<div class="ch-num">\\u7b2c'+ch.id+'\\u7ae0</div>';
    h+='<div class="ch-name">'+ch.name+'</div>';
    h+='<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>';
    h+='<div class="ch-score">'+s.correct+'/'+ch.questions.length+'\\u554f \\u6b63\\u89e3</div></div>';
  });
  h+='</div>';
  h+='<div class="reset-area"><button class="reset-btn" onclick="resetAll()">\\u5168\\u30c7\\u30fc\\u30bf\\u30ea\\u30bb\\u30c3\\u30c8</button></div>';
  h+='<footer>\\u8a3a\\u7642\\u60c5\\u5831\\u7ba1\\u7406\\u58eb\\u8a66\\u9a13\\u5bfe\\u7b56 \\u2014 \\u5b66\\u7fd2\\u7528\\u6a21\\u64ec\\u554f\\u984c\\u96c6</footer>';
  app.innerHTML=h;
}

function startChapter(id){
  var ch=CH.find(function(c){return c.id===id;});if(!ch)return;
  state.chId=id;state.qIdx=0;state.mode="chapter";
  state.questions=ch.questions.map(function(q,i){return{chId:id,qIdx:i,data:q};});
  state.answers={};renderQuiz();
}
function startRandom(){
  var pool=[];CH.forEach(function(ch){ch.questions.forEach(function(q,i){pool.push({chId:ch.id,qIdx:i,data:q});});});
  state.questions=shuffle(pool).slice(0,20);state.qIdx=0;state.mode="random";state.answers={};state.chId=null;renderQuiz();
}
function startWrongReview(){
  var wrong=getWrong();if(!wrong.length){alert("\\u9593\\u9055\\u3048\\u305f\\u554f\\u984c\\u306f\\u3042\\u308a\\u307e\\u305b\\u3093\\u3002");return;}
  var qs=[];wrong.forEach(function(w){var ch=CH.find(function(c){return c.id===w.chId;});if(ch&&ch.questions[w.qIdx])qs.push({chId:w.chId,qIdx:w.qIdx,data:ch.questions[w.qIdx]});});
  state.questions=shuffle(qs);state.qIdx=0;state.mode="wrong";state.answers={};state.chId=null;renderQuiz();
}
function startBookmarkReview(){
  var bm=getBookmarks();if(!bm.length){alert("\\u30d6\\u30c3\\u30af\\u30de\\u30fc\\u30af\\u306f\\u3042\\u308a\\u307e\\u305b\\u3093\\u3002");return;}
  var qs=[];bm.forEach(function(b){var ch=CH.find(function(c){return c.id===b.chId;});if(ch&&ch.questions[b.qIdx])qs.push({chId:b.chId,qIdx:b.qIdx,data:ch.questions[b.qIdx]});});
  state.questions=qs;state.qIdx=0;state.mode="bookmark";state.answers={};state.chId=null;renderQuiz();
}

function renderQuiz(){
  state.screen="quiz";bnav.classList.remove("hidden");
  var title=getTitle();var total=state.questions.length;
  var qObj=state.questions[state.qIdx];var qData=qObj.data;
  var qKey=qObj.chId+"_"+qObj.qIdx;var ans=state.answers[qKey];
  var answered=ans!==undefined;var isCorrect=answered&&ans===qData.a;
  var bm=getBookmarks();var isBookmarked=bm.some(function(b){return b.chId===qObj.chId&&b.qIdx===qObj.qIdx;});
  var pct=Math.round((state.qIdx+1)/total*100);
  var h='<div class="quiz-header"><button class="back-btn" onclick="goHome()">\\u2190</button>';
  h+='<span class="quiz-title">'+title+'</span><span class="q-counter">'+(state.qIdx+1)+' / '+total+'</span></div>';
  h+='<div class="progress-bar-wrap"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div></div>';
  h+='<div class="q-card fade-in'+(answered?(isCorrect?' correct':' wrong'):'')+'">';
  h+='<button class="bookmark-btn'+(isBookmarked?' active':'')+'" onclick="toggleBookmark('+qObj.chId+','+qObj.qIdx+')">'+(isBookmarked?'\\u2605':'\\u2606')+'</button>';
  h+='<div class="q-text">Q'+(state.qIdx+1)+'. '+qData.q+'</div><div class="choices">';
  var labels=["A","B","C","D"];
  for(var i=0;i<qData.c.length;i++){
    var cls="choice-btn";
    if(answered){if(i===qData.a)cls+=" correct-choice";else if(i===ans)cls+=" wrong-choice";}
    h+='<button class="'+cls+'"'+(answered?' disabled':'')+' onclick="selectAnswer('+i+')"><span class="result-icon">';
    if(answered&&i===qData.a)h+='\\u2713';else if(answered&&i===ans)h+='\\u2717';else h+=labels[i]+'.';
    h+='</span> '+qData.c[i]+'</button>';
  }
  h+='</div>';
  if(answered&&qData.e){
    var e=qData.e;
    h+='<div class="explanation show"><div class="expl-section"><div class="expl-label green">\\u25cb \\u6b63\\u89e3\\u306e\\u89e3\\u8aac</div>'+e.correct+'</div>';
    if(e.wrong){h+='<div class="expl-section"><div class="expl-label red">\\u2717 \\u8aa4\\u7b54\\u80a2\\u306e\\u89e3\\u8aac</div>';for(var wk in e.wrong){if(e.wrong.hasOwnProperty(wk))h+='<div class="expl-wrong-item"><strong>'+wk+'.</strong> '+e.wrong[wk]+'</div>';}h+='</div>';}
    if(e.point)h+='<div class="expl-section"><div class="expl-label blue">\\u2606 \\u8a66\\u9a13\\u306e\\u30dd\\u30a4\\u30f3\\u30c8</div>'+e.point+'</div>';
    h+='</div>';
  }
  h+='</div>';app.innerHTML=h;
  prevBtn.disabled=state.qIdx===0;
  nextBtn.textContent=(state.qIdx===total-1&&answered)?"\\u7d50\\u679c\\u3092\\u898b\\u308b":"\\u6b21\\u3078 \\u2192";
  nextBtn.disabled=!answered;navCenter.textContent=(state.qIdx+1)+' / '+total;
}

function selectAnswer(idx){
  var qObj=state.questions[state.qIdx];var qKey=qObj.chId+"_"+qObj.qIdx;
  if(state.answers[qKey]!==undefined)return;state.answers[qKey]=idx;
  var isCorrect=idx===qObj.data.a;
  if(state.mode==="chapter"){var s=getScore(qObj.chId);s.total++;if(isCorrect)s.correct++;setScore(qObj.chId,s);}
  if(!isCorrect){var w=getWrong();if(!w.some(function(x){return x.chId===qObj.chId&&x.qIdx===qObj.qIdx;})){w.push({chId:qObj.chId,qIdx:qObj.qIdx});setWrong(w);}}
  else{var w=getWrong();w=w.filter(function(x){return!(x.chId===qObj.chId&&x.qIdx===qObj.qIdx);});setWrong(w);}
  renderQuiz();
}

function toggleBookmark(chId,qIdx){
  var bm=getBookmarks();var idx=bm.findIndex(function(b){return b.chId===chId&&b.qIdx===qIdx;});
  if(idx>=0)bm.splice(idx,1);else bm.push({chId:chId,qIdx:qIdx});setBookmarks(bm);renderQuiz();
}

function goPrev(){if(state.qIdx>0){state.qIdx--;renderQuiz();}}
function goNext(){
  if(state.qIdx<state.questions.length-1){state.qIdx++;renderQuiz();}
  else renderResults();
}

function renderResults(){
  state.screen="results";bnav.classList.add("hidden");
  var correct=0,total=state.questions.length,wrongList=[];
  state.questions.forEach(function(qObj,i){
    var qKey=qObj.chId+"_"+qObj.qIdx;var ans=state.answers[qKey];
    if(ans===qObj.data.a)correct++;
    else wrongList.push({idx:i,q:qObj.data.q,yourAns:qObj.data.c[ans]||"",correctAns:qObj.data.c[qObj.data.a]});
  });
  var pct=Math.round(correct/total*100);
  var h='<div class="quiz-header"><button class="back-btn" onclick="goHome()">\\u2190</button><span class="quiz-title">\\u7d50\\u679c</span></div>';
  h+='<div class="result-card"><div class="result-score">'+correct+' / '+total+'</div><div class="result-label">\\u6b63\\u7b54\\u7387 '+pct+'%</div></div>';
  if(wrongList.length>0){
    h+='<div class="result-card" style="text-align:left"><div style="font-weight:700;margin-bottom:12px">\\u9593\\u9055\\u3048\\u305f\\u554f\\u984c ('+wrongList.length+'\\u554f)</div>';
    wrongList.forEach(function(w){
      h+='<div class="result-list-item"><div style="font-weight:500;margin-bottom:4px">Q'+(w.idx+1)+'. '+w.q+'</div>';
      h+='<div style="color:var(--red);font-size:.8rem">\\u2717 '+w.yourAns+'</div>';
      h+='<div style="color:var(--green);font-size:.8rem">\\u25cb '+w.correctAns+'</div></div>';
    });h+='</div>';
  }
  h+='<button class="btn btn-primary" onclick="goHome()" style="margin-top:16px">\\u30db\\u30fc\\u30e0\\u306b\\u623b\\u308b</button>';
  app.innerHTML=h;
}

function goHome(){renderHome();}
function resetAll(){
  if(!confirm("\\u3059\\u3079\\u3066\\u306e\\u5b66\\u7fd2\\u30c7\\u30fc\\u30bf\\u3092\\u30ea\\u30bb\\u30c3\\u30c8\\u3057\\u307e\\u3059\\u304b\\uff1f"))return;
  var keys=[];for(var i=0;i<LS.length;i++){var k=LS.key(i);if(k&&k.indexOf("himq_")===0)keys.push(k);}
  keys.forEach(function(k){LS.removeItem(k);});renderHome();
}
renderHome();`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>診療情報管理士 模擬問題集</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
${CSS}
</style>
</head>
<body>
<div class="container" id="app"></div>
<div class="bottom-nav hidden" id="bottomNav">
<button class="nav-btn" id="prevBtn" onclick="goPrev()">&#8592; 前へ</button>
<span class="nav-center" id="navCenter"></span>
<button class="nav-btn primary" id="nextBtn" onclick="goNext()">次へ &#8594;</button>
</div>
<script>var defined_chapters=${chaptersJson};</script>
<script>
${JS}
</script>
</body>
</html>`;

const outPath = path.join(__dirname, 'him-quiz-v2.html');
fs.writeFileSync(outPath, html, 'utf8');
const totalQ = chapterBlocks.reduce((s,c) => s + c.questions.length, 0);
console.log(`Written: ${outPath}`);
console.log(`Chapters: ${chapterBlocks.length}, Questions: ${totalQ}`);
console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
