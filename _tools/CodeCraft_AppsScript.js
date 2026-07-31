// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GITHUB_TOKEN         = 'YOUR_GITHUB_TOKEN_HERE';
const GITHUB_REPO          = 'adele-cc/codecraft-reports';
const TEMPLATE_PATH        = '_template/index.html';
const TWITTER_BEARER_TOKEN = '';
// ─────────────────────────────────────────────────────────────────────────────

function fetchTweetData(tweetUrl) {
  if (!tweetUrl) return null;
  var urlStr  = String(tweetUrl);
  var idMatch = urlStr.match(/status\/(\d+)/);
  if (!idMatch) return null;
  var tweetId = idMatch[1];
  var handleMatch = urlStr.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)\/status\//);
  var urlHandle   = handleMatch ? handleMatch[1] : 'i';

  if (TWITTER_BEARER_TOKEN) {
    try {
      var resp = UrlFetchApp.fetch(
        'https://api.twitter.com/2/tweets/' + tweetId
        + '?expansions=attachments.media_keys,author_id'
        + '&media.fields=url,preview_image_url&tweet.fields=public_metrics&user.fields=name,username,profile_image_url',
        { headers: { Authorization: 'Bearer ' + TWITTER_BEARER_TOKEN }, muteHttpExceptions: true }
      );
      if (resp.getResponseCode() === 200) {
        var payload = JSON.parse(resp.getContentText());
        var tweet = payload.data; var inc = payload.includes || {};
        var user = (inc.users||[])[0]||{}; var media = (inc.media||[])[0]||{};
        var metrics = tweet.public_metrics || {};
        return {
          name: user.name||'', handle: user.username?'@'+user.username:'',
          avatar: (user.profile_image_url||'').replace('_normal','_bigger'),
          text: tweet.text||'', imageUrl: media.url||media.preview_image_url||null,
          views: metrics.impression_count||null, likes: metrics.like_count||null,
          reposts: metrics.retweet_count||null, replies: metrics.reply_count||null,
          url: tweetUrl
        };
      }
    } catch(e) {}
  }

  // fxtwitter JSON API — free, no key, full data including avatar + media
  try {
    var fxResp = UrlFetchApp.fetch(
      'https://api.fxtwitter.com/' + urlHandle + '/status/' + tweetId,
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (fxResp.getResponseCode() === 200) {
      var fx  = JSON.parse(fxResp.getContentText());
      var fxT = fx.tweet||{}; var fxA = fxT.author||{}; var fxM = fxT.media||{};
      var fxP = fxM.photos||[]; var fxV = fxM.videos||[];
      var imgUrl = fxP.length ? fxP[0].url : (fxV.length ? fxV[0].thumbnail_url||null : null);

      // Fetch avatar as base64 at deploy time — bypasses Twitter CDN hotlink blocking
      var avatarData = null;
      try {
        var avUrl = (fxA.avatar_url||'').replace('_normal','_bigger');
        if (avUrl) {
          var avR = UrlFetchApp.fetch(avUrl, { muteHttpExceptions: true });
          if (avR.getResponseCode() === 200) {
            var avB = avR.getBlob();
            avatarData = 'data:' + (avB.getContentType()||'image/jpeg') + ';base64,' + Utilities.base64Encode(avB.getBytes());
          }
        }
      } catch(e) { avatarData = fxA.avatar_url||null; }

      return {
        name: fxA.name||'', handle: fxA.screen_name?'@'+fxA.screen_name:'',
        avatar: avatarData, text: fxT.text||'', imageUrl: imgUrl,
        views: fxT.views||null, likes: fxT.likes||null,
        reposts: fxT.retweets||null, replies: fxT.replies||null,
        followers: fxA.followers||null,
        url: tweetUrl
      };
    }
  } catch(e) {}

  // oEmbed fallback — text + author only, avatar from URL handle
  try {
    var oeResp = UrlFetchApp.fetch(
      'https://publish.twitter.com/oembed?url=' + encodeURIComponent(tweetUrl) + '&omit_script=true&dnt=true',
      { muteHttpExceptions: true }
    );
    if (oeResp.getResponseCode() === 200) {
      var oe = JSON.parse(oeResp.getContentText());
      var html = oe.html||'';
      var pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      var text = '';
      if (pMatch) {
        text = pMatch[1]
          .replace(/<a\b[^>]*href="https?:\/\/t\.co\/[^"]*"[^>]*>[^<]*<\/a>/gi, '')
          .replace(/<a\b[^>]*>([^<]*)<\/a>/gi, '$1')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
          .trim();
      }
      return {
        name: oe.author_name||'', handle: urlHandle?'@'+urlHandle:'',
        avatar: urlHandle ? 'https://unavatar.io/twitter/'+urlHandle : null,
        text: text, imageUrl: null,
        views: null, likes: null, reposts: null, replies: null,
        url: tweetUrl
      };
    }
  } catch(e) {}

  return null;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 CodeCraft')
    .addItem('Deploy Report',        'deployReport')
    .addItem('📷 Upload Screenshot', 'showUploadDialog')
    .addItem('🔍 Run Diagnostics',   'runDiagnostics')
    .addItem('🗑️ Remove Report',     'removeReport')
    .addToUi();
}

function pushTemplate() {
  var ui  = SpreadsheetApp.getUi();
  var url = 'https://raw.githubusercontent.com/adele-cc/codecraft-reports/main/_template/index.html';
  // fetch current template SHA
  var shaResp = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + TEMPLATE_PATH,
    { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN }, muteHttpExceptions: true }
  );
  var sha = null;
  if (shaResp.getResponseCode() === 200) sha = JSON.parse(shaResp.getContentText()).sha;

  // The updated template HTML (with tweet cards, screenshots, KOL cards)
  var TEMPLATE_HTML = '<!DOCTYPE html>\n<html lang="en">\n<!-- CODECRAFT REPORT TEMPLATE v2 -->\n<!-- Push via Apps Script pushTemplate() after editing locally -->\n<!-- See: https://github.com/adele-cc/codecraft-reports/_template/index.html -->\n</html>';

  ui.alert(
    '⚠️ pushTemplate() requires the HTML to be pasted into this function.\n\n' +
    'Instead: go to GitHub → adele-cc/codecraft-reports → _template/index.html → Edit → paste the contents of Moviton_Deploy/index.html with the CC_DATA_INJECT markers replaced with the placeholder.\n\n' +
    'Current template SHA: ' + (sha || 'not found')
  );
}

// ─── SCREENSHOT UPLOAD ────────────────────────────────────────────────────────
function showUploadDialog() {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var tabName = sheet.getName();
  var slug    = tabName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  var rows    = sheet.getDataRange().getValues();

  // Build extra image options
  var extraImageOptions = '';
  rows.forEach(function(r) {
    var sec = String(r[0]||'').trim();
    var key = String(r[1]||'').trim();
    var lbl = String(r[2]||'').trim() || key;
    if (sec && key && /_image\d*$/.test(key)) {
      extraImageOptions += '<option value="'+sec+'/'+key+'">'+lbl+' ('+sec+')</option>';
    }
  });

  // Bake GitHub config into HTML — GitHub upload is browser-side, no Google auth needed
  var cfg = JSON.stringify({ slug: slug, tab: tabName, repo: GITHUB_REPO, ghToken: GITHUB_TOKEN });

  var options =
    '<option value="meta/banner">Report Banner</option>' +
    '<option value="meta/clientLogo">Client Logo</option>' +
    '<option value="social/mutualScreenshot">Mutual Followers Screenshot</option>' +
    '<option value="cookie3/screenshot">Cookie3 Dashboard Screenshot</option>' +
    '<option value="quest/screenshot_1">Quest Screenshot 1</option>' +
    '<option value="quest/screenshot_2">Quest Screenshot 2 (Leaderboard)</option>' +
    '<option value="quest/screenshot_3">Quest Screenshot 3</option>' +
    '<option value="quest/screenshot_4">Quest Screenshot 4</option>' +
    '<option value="nucContrib/screenshot">Nucleus Analytics Screenshot</option>' +
    '<option value="kol/scoreImg">KOL Score Screenshot</option>' +
    (extraImageOptions ? '<optgroup label="── Custom Images ──">'+extraImageOptions+'</optgroup>' : '');

  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '*{font-family:sans-serif;box-sizing:border-box}body{margin:16px}' +
    'label{display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px}' +
    'select,input{width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px}' +
    'button{width:100%;padding:10px;background:#88F802;color:#000;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer}' +
    'button:disabled{background:#ccc}' +
    '.tabs{display:flex;margin-bottom:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden}' +
    '.tab{flex:1;padding:8px;font-size:12px;font-weight:600;text-align:center;cursor:pointer;background:#f5f5f5;color:#888;border:none}' +
    '.tab.on{background:#fff;color:#000}' +
    '#status{margin-top:10px;font-size:12px;color:#555;text-align:center;min-height:18px}' +
    '</style>' +
    '<script>var CFG='+cfg+';<\/script>' +
    '<label>Field</label>' +
    '<select id="field">'+options+'</select>' +
    '<div class="tabs">' +
    '<button class="tab on" id="tabFile" onclick="switchTab(\'file\')">📁 Upload file</button>' +
    '<button class="tab" id="tabUrl" onclick="switchTab(\'url\')">🔗 Paste URL</button>' +
    '</div>' +
    '<div id="paneFile"><label>Image file</label><input type="file" id="img" accept="image/*"></div>' +
    '<div id="paneUrl" style="display:none"><label>Image URL</label><input type="text" id="url" placeholder="https://…"></div>' +
    '<button id="btn" onclick="go()">Upload</button>' +
    '<div id="status"></div>' +
    '<script>' +
    'function switchTab(t){' +
    '  var f=t==="file";' +
    '  document.getElementById("paneFile").style.display=f?"":"none";' +
    '  document.getElementById("paneUrl").style.display=f?"none":"";' +
    '  document.getElementById("tabFile").className="tab"+(f?" on":"");' +
    '  document.getElementById("tabUrl").className="tab"+(!f?" on":"");' +
    '}' +
    'function writeCell(imgUrl){' +
    '  var field=document.getElementById("field").value;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(){setStatus("✅ Done! <small style=\'color:#888\'>"+imgUrl+"<\/small>");})' +
    '    .withFailureHandler(function(){showCopy(imgUrl);})' +
    '    .saveImageUrl(imgUrl,field);' +
    '}' +
    'function showCopy(url){' +
    '  document.getElementById("status").innerHTML=' +
    '    "✅ Uploaded! Paste this URL into column F:<br>"' +
    '    +"<input style=\'font-size:10px;margin-top:6px\' value=\'"+url+"\' onclick=\'this.select()\'>";' +
    '  var b=document.getElementById("btn");b.textContent="Upload";b.disabled=false;' +
    '}' +
    'function setStatus(s){document.getElementById("status").innerHTML=s;var b=document.getElementById("btn");b.textContent="Upload";b.disabled=false;}' +
    'function go(){' +
    '  var btn=document.getElementById("btn");' +
    '  var isUrl=document.getElementById("paneUrl").style.display!=="none";' +
    '  btn.disabled=true;' +
    '  if(isUrl){' +
    '    var u=document.getElementById("url").value.trim();' +
    '    if(!u){setStatus("Paste a URL first.");return;}' +
    '    btn.textContent="Saving…";' +
    '    writeCell(u);' +
    '  } else {' +
    '    var f=document.getElementById("img").files[0];' +
    '    if(!f){setStatus("Pick a file first.");return;}' +
    '    btn.textContent="Uploading…";' +
    '    var r=new FileReader();' +
    '    r.onload=function(ev){' +
    '      var b64=ev.target.result.split(",")[1];' +
    '      var field=document.getElementById("field").value;' +
    '      var ext=(f.type||"image/png").split("/")[1].split("+")[0];' +
    '      var fileName=field.replace("/","_")+"."+ext;' +
    '      var ghPath="client-assets/"+CFG.slug+"/"+fileName;' +
    '      var apiUrl="https://api.github.com/repos/"+CFG.repo+"/contents/"+ghPath;' +
    '      document.getElementById("status").textContent="Uploading to GitHub…";' +
    '      fetch(apiUrl,{headers:{Authorization:"Bearer "+CFG.ghToken}})' +
    '        .then(function(r){return r.ok?r.json():null;})' +
    '        .then(function(ex){' +
    '          var body={message:"Upload "+field+" for "+CFG.tab,content:b64};' +
    '          if(ex&&ex.sha)body.sha=ex.sha;' +
    '          return fetch(apiUrl,{method:"PUT",headers:{Authorization:"Bearer "+CFG.ghToken,"Content-Type":"application/json"},body:JSON.stringify(body)});' +
    '        })' +
    '        .then(function(r){return r.json();})' +
    '        .then(function(res){' +
    '          if(!res.content)throw new Error(res.message||"Upload failed");' +
    '          var rawUrl="https://raw.githubusercontent.com/"+CFG.repo+"/main/"+res.content.path;' +
    '          writeCell(rawUrl);' +
    '        })' +
    '        .catch(function(e){setStatus("❌ "+e.message);});' +
    '    };' +
    '    r.readAsDataURL(f);' +
    '  }' +
    '}' +
    '<\/script>'
  ).setWidth(380).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, '📷 Upload Screenshot');
}

function uploadScreenshot(b64, mime, fieldKey) {
  var sheet    = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var tabName  = sheet.getName();
  var slug     = tabName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  var ext      = (mime.split('/')[1]||'png').split('+')[0];
  var fileName = fieldKey.replace('/','_') + '.' + ext;
  var imgUrl   = null;

  // ── Upload to GitHub (primary — avoids all Drive permission issues) ──────────
  try {
    var ghPath = 'client-assets/' + slug + '/' + fileName;
    var sha    = null;
    try {
      var ex = UrlFetchApp.fetch(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + ghPath,
        { headers:{ Authorization:'Bearer '+GITHUB_TOKEN }, muteHttpExceptions:true }
      );
      if (ex.getResponseCode()===200) sha = JSON.parse(ex.getContentText()).sha;
    } catch(e) {}

    var payload = { message:'Upload '+fieldKey+' for '+tabName, content:b64 };
    if (sha) payload.sha = sha;

    var resp = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + ghPath,
      { method:'put', muteHttpExceptions:true,
        headers:{ Authorization:'Bearer '+GITHUB_TOKEN, 'Content-Type':'application/json' },
        payload:JSON.stringify(payload) }
    );
    var code = resp.getResponseCode();
    if (code===200||code===201) {
      imgUrl = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/' + ghPath;
    } else {
      throw new Error('GitHub API returned ' + code + ': ' + resp.getContentText().slice(0,200));
    }
  } catch(e) { throw e; }

  // ── If GitHub failed, surface a clear error (no Drive fallback — org policy blocks it) ──
  if (!imgUrl) {
    throw new Error('GitHub upload failed. Check that the GitHub token is valid and the repo exists.');
  }

  // ── Write URL back to sheet ──────────────────────────────────────────────────
  var rows  = sheet.getDataRange().getValues();
  var parts = fieldKey.split('/');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0]===parts[0] && rows[i][1]===parts[1]) {
      sheet.getRange(i+1, 6).setValue(imgUrl);
      SpreadsheetApp.flush();
      break;
    }
  }
  return imgUrl;
}

function getUploadConfig() {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var tabName = sheet.getName();
  var slug    = tabName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return { slug: slug, tab: tabName, repo: GITHUB_REPO, token: GITHUB_TOKEN };
}

function saveImageUrl(url, fieldKey) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows  = sheet.getDataRange().getValues();
  var parts = fieldKey.split('/');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim()===parts[0] && String(rows[i][1]).trim()===parts[1]) {
      sheet.getRange(i+1, 6).setValue(url);
      SpreadsheetApp.flush();
      return;
    }
  }
  throw new Error('Could not find row for field "'+fieldKey+'" in this sheet.');
}
// ─────────────────────────────────────────────────────────────────────────────

function runDiagnostics() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var msgs  = [];

  try {
    var imgs = sheet.getImages();
    msgs.push('Over-grid images: ' + (imgs.length === 0 ? 'none' : imgs.length));
  } catch(e) { msgs.push('Over-grid images ERROR: ' + e.message); }

  try {
    var rows = sheet.getDataRange().getValues();
    var imageKeys = [
      ['meta','clientLogo'],['social','mutualScreenshot'],['cookie3','screenshot'],
      ['quest','screenshot_1'],['quest','screenshot_2'],['quest','screenshot_3'],['quest','screenshot_4'],
      ['nucContrib','screenshot'],['kol','scoreImg']
    ];
    var rowInfo = [];
    imageKeys.forEach(function(sk) {
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0]===sk[0] && rows[i][1]===sk[1]) {
          var cv = String(rows[i][5]||'').trim();
          rowInfo.push(sk[0]+'/'+sk[1]+' → row '+(i+1)+'\n    col F: '+(cv ? cv.substring(0,70) : '(empty)'));
          break;
        }
      }
    });
    msgs.push('Image cells:\n' + rowInfo.join('\n'));
  } catch(e) { msgs.push('Image cells ERROR: ' + e.message); }

  try {
    var rows2   = sheet.getDataRange().getValues();
    var postRow = rows2.find(function(r){ return r[0]==='social' && r[1]==='post_1_url'; });
    if (postRow) {
      var url = String(postRow[5]||'').trim();
      msgs.push('post_1_url: ' + (url||'(empty)'));
      if (url) {
        var td = fetchTweetData(url);
        if (td) {
          msgs.push('fetchTweetData():\n'
            + '  name: '     + td.name + '\n'
            + '  handle: '   + td.handle + '\n'
            + '  avatar: '   + (td.avatar   ? td.avatar.substring(0,50)   : 'null') + '\n'
            + '  imageUrl: ' + (td.imageUrl ? td.imageUrl.substring(0,60) : 'null') + '\n'
            + '  likes: '    + td.likes + ' | views: ' + td.views);
        } else {
          msgs.push('fetchTweetData() → null (all methods failed)');
        }
      }
    } else {
      msgs.push('post_1_url: not found in sheet');
    }
  } catch(e) { msgs.push('Tweet test ERROR: ' + e.message); }

  ui.alert('🔍 Diagnostics — ' + sheet.getName() + '\n\n' + msgs.join('\n\n'));
}

function deployReport() {
  const ui      = SpreadsheetApp.getUi();
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const tabName = sheet.getName();

  if (tabName.startsWith('_')) {
    ui.alert('⚠️ This tab is reserved and cannot be deployed.');
    return;
  }

  const slug     = tabName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const filePath = slug + '/index.html';

  try {
    const rows        = sheet.getDataRange().getValues();
    const imagesByRow = getImagesByRow(sheet);
    const D           = buildDObject(rows, imagesByRow);

    const tplResp = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + TEMPLATE_PATH,
      { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN } }
    );
    const tplData      = JSON.parse(tplResp.getContentText());
    const templateHtml = Utilities.newBlob(
      Utilities.base64Decode(tplData.content.replace(/\n/g,''))
    ).getDataAsString();

    const dStr = JSON.stringify(D, null, 2);

    // Verify template has inject markers before doing anything
    const markerRx = /\/\*CC_DATA_INJECT_START\*\/[\s\S]*?\/\*CC_DATA_INJECT_END\*\//;
    if (!markerRx.test(templateHtml)) {
      var tplSnippet = templateHtml.substring(0, 300).replace(/\n/g,' ');
      ui.alert(
        '❌ Template marker not found!\n\n' +
        'The template at _template/index.html must contain:\n' +
        '  /*CC_DATA_INJECT_START*/\n' +
        '  const D = {};\n' +
        '  /*CC_DATA_INJECT_END*/\n\n' +
        'Template starts with:\n' + tplSnippet
      );
      return;
    }

    const injected = templateHtml
      .replace(
        markerRx,
        '/*CC_DATA_INJECT_START*/\nconst D = ' + dStr + ';\n/*CC_DATA_INJECT_END*/'
      )
      // Prevent CDN hotlink blocking (Twitter avatars/images, Drive)
      .replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="referrer" content="no-referrer">');

    let sha = null;
    try {
      var ex = UrlFetchApp.fetch(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath,
        { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN }, muteHttpExceptions: true }
      );
      if (ex.getResponseCode() === 200) sha = JSON.parse(ex.getContentText()).sha;
    } catch(e) {}

    const payload = {
      message: 'Deploy ' + tabName + ': ' + (D.weekDate||'update'),
      content:  Utilities.base64Encode(Utilities.newBlob(injected).getBytes())
    };
    if (sha) payload.sha = sha;

    var putResp = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath,
      { method: 'put', headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, 'Content-Type': 'application/json' }, payload: JSON.stringify(payload) }
    );
    var putData   = JSON.parse(putResp.getContentText());
    var commitSha = (putData.commit && putData.commit.sha) ? putData.commit.sha.substring(0,8) : '?';

    // Verify: fetch the file back from GitHub and confirm client name is in it
    var verifyMsg = '';
    try {
      Utilities.sleep(1500);
      var vr = UrlFetchApp.fetch(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath,
        { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN }, muteHttpExceptions: true }
      );
      if (vr.getResponseCode() === 200) {
        var vContent = Utilities.newBlob(Utilities.base64Decode(JSON.parse(vr.getContentText()).content.replace(/\n/g,''))).getDataAsString();
        var clientInFile = vContent.indexOf('"' + D.client + '"') !== -1;
        verifyMsg = '\n✅ GitHub verified: client name ' + (clientInFile ? 'FOUND in file' : '❌ NOT found in file — data not saved!');
      } else {
        verifyMsg = '\n⚠️ Verify fetch returned HTTP ' + vr.getResponseCode();
      }
    } catch(e) { verifyMsg = '\n⚠️ Verify error: ' + e.message; }

    ui.alert(
      '✅ Deployed!\n\n' +
      'URL: https://adele-cc.github.io/codecraft-reports/' + slug + '/\n\n' +
      '(Hard refresh: Ctrl+Shift+R)'
    );

  } catch(e) {
    ui.alert('❌ Deploy failed\n\n' + e.message);
  }
}

function removeReport() {
  var ui      = SpreadsheetApp.getUi();
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var tabName = sheet.getName();
  var slug    = tabName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  var confirm = ui.alert(
    'Remove report for "' + tabName + '"?',
    'This will permanently delete https://adele-cc.github.io/codecraft-reports/' + slug + '/ from GitHub.',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  var filePath = slug + '/index.html';
  try {
    var ex = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath,
      { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN }, muteHttpExceptions: true }
    );
    if (ex.getResponseCode() !== 200) {
      ui.alert('⚠️ No report found for "' + slug + '" on GitHub.');
      return;
    }
    var sha = JSON.parse(ex.getContentText()).sha;
    var del = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath,
      { method: 'delete', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ message: 'Remove ' + tabName + ' report', sha: sha }) }
    );
    var code = del.getResponseCode();
    if (code === 200) {
      ui.alert('✅ Report removed.\n\nThe URL is no longer live.');
    } else {
      ui.alert('❌ Delete failed (HTTP ' + code + ')\n\n' + del.getContentText().slice(0,200));
    }
  } catch(e) {
    ui.alert('❌ Error\n\n' + e.message);
  }
}

// ─── IMAGE READER ─────────────────────────────────────────────────────────────
function getImagesByRow(sheet) {
  var map = {};
  try {
    var imgs = sheet.getImages();
    for (var i = 0; i < imgs.length; i++) {
      try {
        var row  = imgs[i].getAnchorCell().getRow();
        var blob = null;
        if (typeof imgs[i].getBlob === 'function')    blob = imgs[i].getBlob();
        else if (typeof imgs[i].getAs === 'function') blob = imgs[i].getAs(MimeType.PNG);
        if (!blob && typeof imgs[i].getUrl === 'function') {
          var su = imgs[i].getUrl();
          if (su) { var r = UrlFetchApp.fetch(su, {muteHttpExceptions:true}); if (r.getResponseCode()===200) blob = r.getBlob(); }
        }
        if (blob) {
          var mime = blob.getContentType()||'image/png';
          map[row] = 'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
        }
      } catch(e) {}
    }
  } catch(e) {}
  return map;
}

var XQUIK_API_KEY = 'YOUR_XQUIK_API_KEY_HERE';

function fetchTwitterProfile(profileUrl, manualFollowers) {
  if (!profileUrl) return { avatar: null, followersLabel: manualFollowers || null, authorName: null };
  var m = String(profileUrl).match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/);
  var handle = m ? m[1] : null;
  if (!handle || handle.toLowerCase() === 'i') return { avatar: null, followersLabel: manualFollowers || null, authorName: null };

  var avatar = null;
  var followersLabel = manualFollowers || null;
  var authorName = null;

  // Use xquik API — GET /api/v1/x/users/:username — returns followers, name, profile_picture
  try {
    var r = UrlFetchApp.fetch(
      'https://xquik.com/api/v1/x/users/' + handle,
      { muteHttpExceptions: true, headers: { 'x-api-key': XQUIK_API_KEY } }
    );
    if (r.getResponseCode() === 200) {
      var u = JSON.parse(r.getContentText());
      if (typeof u.followers === 'number' && !followersLabel) followersLabel = fmtFollowers(u.followers) + ' X Followers';
      if (u.name) authorName = u.name;
      // Embed avatar as base64 from profile_picture URL
      var avUrl = u.profile_picture || null;
      if (avUrl) {
        try {
          var ar = UrlFetchApp.fetch(avUrl, { muteHttpExceptions: true });
          if (ar.getResponseCode() === 200) {
            var ab = ar.getBlob();
            avatar = 'data:' + (ab.getContentType()||'image/jpeg') + ';base64,' + Utilities.base64Encode(ab.getBytes());
          }
        } catch(e) {}
      }
    }
  } catch(e) {}

  // Fallback avatar: unavatar.io
  if (!avatar) {
    try {
      var ur = UrlFetchApp.fetch(
        'https://unavatar.io/twitter/' + handle,
        { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (ur.getResponseCode() === 200) {
        var ub = ur.getBlob();
        avatar = 'data:' + (ub.getContentType()||'image/jpeg') + ';base64,' + Utilities.base64Encode(ub.getBytes());
      }
    } catch(e) {}
    if (!avatar) avatar = 'https://unavatar.io/twitter/' + handle;
  }

  return { avatar: avatar, followersLabel: followersLabel, authorName: authorName };
}

function fmtFollowers(n) {
  if (!n) return null;
  var num = parseInt(String(n).replace(/[^0-9]/g,''));
  if (isNaN(num) || num === 0) return String(n);
  if (num >= 1000000) return (num/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (num >= 1000) return Math.round(num/1000) + 'k';
  return String(num);
}

function driveUrlToImg(url) {
  if (!url) return null;
  var s = String(url);
  var match = s.match(/[?&]id=([a-zA-Z0-9_-]+)/) || s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return url; // non-Drive URL — use as-is

  var id = match[1];

  // Try DriveApp first (works when the script owner owns the file)
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    var ct = blob.getContentType() || 'image/jpeg';
    return 'data:' + ct + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch(e) {}

  // Fallback: fetch via UrlFetchApp with OAuth token (works for files shared with the user)
  try {
    var token = ScriptApp.getOAuthToken();
    var r = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media',
      { headers:{ Authorization:'Bearer '+token }, muteHttpExceptions:true }
    );
    if (r.getResponseCode()===200) {
      var b = r.getBlob();
      var ct2 = b.getContentType() || 'image/jpeg';
      return 'data:' + ct2 + ';base64,' + Utilities.base64Encode(b.getBytes());
    }
  } catch(e) {}

  // Last resort: public thumbnail URL (only works if file is shared publicly)
  return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200';
}

// ─── PODCAST FETCH ────────────────────────────────────────────────────────────
function fetchPodcastData(url) {
  if (!url) return { url:url, platUrl:url, title:'', thumb:null, guest:'', dur:'' };
  var result = { url:url, platUrl:url, title:'', thumb:null, guest:'', dur:'' };
  var lower  = url.toLowerCase();

  if (lower.indexOf('youtube') !== -1 || lower.indexOf('youtu.be') !== -1) {
    try {
      var oe = UrlFetchApp.fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json', { muteHttpExceptions:true });
      if (oe.getResponseCode() === 200) {
        var d = JSON.parse(oe.getContentText());
        result.title = d.title||'';
        result.thumb = d.thumbnail_url ? d.thumbnail_url.replace('hqdefault','maxresdefault') : null;
        result.guest = d.author_name||'';
        return result;
      }
    } catch(e) {}
  }

  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true, followRedirects:true, headers:{'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'} });
    if (resp.getResponseCode() !== 200) return result;
    var html = resp.getContentText().substring(0, 40000);
    function ogP(prop) {
      var pats = [
        new RegExp('<meta[^>]+property=["\']og:'+prop+'["\'][^>]+content=["\']([^"\']*)["\']','i'),
        new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:'+prop+'["\']','i')
      ];
      for (var i=0;i<pats.length;i++){var m=html.match(pats[i]);if(m&&m[1].trim())return m[1].trim();}
      return null;
    }
    var title = ogP('title');
    if (!title) { var tm=html.match(/<title[^>]*>([^<]+)<\/title>/i); if(tm) title=tm[1].trim().replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"'); }
    result.title = title||'';
    result.thumb = ogP('image')||null;
  } catch(e) {}
  return result;
}

// ─── ARTICLE FETCH ────────────────────────────────────────────────────────────
function fetchArticleData(url) {
  if (!url) return { url:url, pub:'', headline:'', date:'', imgUrl:null };
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true, followRedirects:true, headers:{'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'} });
    if (resp.getResponseCode() !== 200) return { url:url, pub:'', headline:'', date:'', imgUrl:null };
    var html = resp.getContentText().substring(0, 40000);

    function og(prop) {
      var pats = [
        new RegExp('<meta[^>]+property=["\']og:'+prop+'["\'][^>]+content=["\']([^"\']*)["\']','i'),
        new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:'+prop+'["\']','i')
      ];
      for (var i=0;i<pats.length;i++){var m=html.match(pats[i]);if(m&&m[1].trim())return m[1].trim();}
      return null;
    }

    var title = og('title');
    if (!title) {
      var tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (tm) title = tm[1].trim().replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    }
    var siteName = og('site_name');
    if (!siteName) { try { siteName = new URL(url).hostname.replace(/^www\./,''); } catch(e) {} }

    var pubDate  = null;
    var datePats = [
      /<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i,
      /<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']article:published_time["\'][^>]*>/i,
      /<meta[^>]+name=["\'](?:date|pubdate|publish-date|publication-date)["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i,
      /<time[^>]+datetime=["\']([^"\']+)["\'][^>]*>/i
    ];
    for (var j=0;j<datePats.length;j++){var dm=html.match(datePats[j]);if(dm){pubDate=dm[1];break;}}
    var dateStr = null;
    if (pubDate) { try { var d=new Date(pubDate); if(!isNaN(d.getTime())) dateStr=Utilities.formatDate(d,'UTC','MMM d'); } catch(e) {} }

    var rawImg = og('image') || og('image:secure_url') || null;
    if (!rawImg) {
      var twImg = html.match(/<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i);
      if (!twImg) twImg = html.match(/<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\'][^>]*>/i);
      if (twImg) rawImg = twImg[1];
    }
    var imgData = null;
    if (rawImg) {
      try {
        var ir = UrlFetchApp.fetch(rawImg, { muteHttpExceptions:true, followRedirects:true, headers:{'User-Agent':'Mozilla/5.0'} });
        if (ir.getResponseCode() === 200) {
          var ib = ir.getBlob();
          var ic = ib.getContentType() || 'image/jpeg';
          if (ic.indexOf('image') === 0) imgData = 'data:' + ic + ';base64,' + Utilities.base64Encode(ib.getBytes());
        }
      } catch(e) {}
    }

    return { url:url, pub:siteName||'', headline:title||'', date:dateStr||'', imgUrl:imgData||rawImg||null };
  } catch(e) {
    return { url:url, pub:'', headline:'', date:'', imgUrl:null };
  }
}

// ─── DATA BUILDER ─────────────────────────────────────────────────────────────
function buildDObject(rows, imagesByRow) {
  imagesByRow = imagesByRow || {};
  var data = rows.slice(1);

  var get     = function(sec,key) { return data.find(function(r){return r[0]===sec&&r[1]===key;}); };
  var m       = function(key) { var r=get('meta',key); if(!r)return null; return String(r[5]||'').trim()||String(r[3]||'').trim()||null; };
  var col     = { start:3, lw:4, now:5 };
  var cellStr = function(v) { if(v===null||v===undefined)return null; var s=String(v).trim(); return s!==''?s:null; };
  var val     = function(sec,key,c) { var r=get(sec,key); if(!r)return null; return cellStr(r[col[c]]); };
  var parseNum= function(s) { if(s===null||s===undefined||s==='')return null; var n=parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isNaN(n)?null:n; };
  var parseVal= function(s) { if(s===null||s===undefined)return null; var n=parseNum(s); return(n!==null&&String(n)===String(s).trim())?n:String(s).trim(); };
  var shown   = function(sec,key) { var r=get(sec,key); if(!r)return false; var s=String(r[6]||'').trim().toUpperCase(); if(s==='N')return false; if(s==='Y')return true; return cellStr(r[5])!==null; };
  var trio    = function(sec,key) { if(!shown(sec,key))return null; return{start:parseVal(val(sec,key,'start')),lw:parseVal(val(sec,key,'lw')),now:parseVal(val(sec,key,'now'))}; };

  var imgVal  = function(sec,key) {
    var idx = -1;
    for (var i=0;i<data.length;i++) { if(data[i][0]===sec&&data[i][1]===key){idx=i;break;} }
    if (idx===-1) return null;
    var sr = idx + 2;
    if (imagesByRow[sr]) return imagesByRow[sr];
    return driveUrlToImg(cellStr(data[idx][5]));
  };

  var extras = function(sec, known) {
    var res = [];
    data.forEach(function(r) {
      if (String(r[0]||'').trim()!==sec) return;
      var key=String(r[1]||'').trim(); if(known.indexOf(key)!==-1) return;
      var sf=String(r[6]||'').trim().toUpperCase(), nv=cellStr(r[5]);
      if (sf==='N') return;
      if (!nv&&sf!=='Y') return;
      var type = /_link\d*$/.test(key) ? 'link' : /_post\d*$/.test(key) ? 'post' : /_text\d*$/.test(key) ? 'text' : /_image\d*$/.test(key) ? 'image' : 'number';
      var item = {key:key,label:String(r[2]||'').trim()||key,type:type,
                  start:parseVal(cellStr(r[3])),lw:parseVal(cellStr(r[4])),now:type==='image'?driveUrlToImg(nv)||nv:parseVal(nv)};
      if (type==='post') { try { var td=fetchTweetData(nv); if(td) item.tweet=td; } catch(e){} }
      res.push(item);
    });
    return res;
  };

  var xPosts = [];
  for (var i=1;i<=5;i++) {
    var xr = get('social','post_'+i+'_url');
    if (!xr||String(xr[6]||'').trim().toUpperCase()==='N') continue;
    var xu = cellStr(xr[5]); if (!xu) continue;
    var xf = fetchTweetData(xu);
    xPosts.push(xf||{url:xu,name:'',handle:'',avatar:null,text:'',imageUrl:null,views:null,likes:null,reposts:null,replies:null});
  }

  var kolPKK = [], kolPosts = [];
  for (var i=1;i<=5;i++) {
    var uk='post_'+i+'_url', fk='post_'+i+'_followers';
    kolPKK.push(uk, fk);
    var kr = get('kol',uk);
    if (!kr||String(kr[6]||'').trim().toUpperCase()==='N') continue;
    var ku = cellStr(kr[5]); if (!ku) continue;
    var kfr = get('kol',fk);
    var kf  = fetchTweetData(ku);
    var sheetFollowers = kfr ? cellStr(kfr[5]) : null;
    if (kf) {
      kf.followers = kf.followers ? fmtFollowers(kf.followers) : sheetFollowers;
      kolPosts.push(kf);
    } else {
      kolPosts.push({url:ku,name:'',handle:'',avatar:null,text:'',imageUrl:null,followers:sheetFollowers,views:null,likes:null,reposts:null,replies:null});
    }
  }

  var qSS = [];
  for (var i=1;i<=4;i++) { var qi=imgVal('quest','screenshot_'+i); if(qi) qSS.push(qi); }

  var prA = [];
  for (var i=1;i<=6;i++) {
    var ar=get('pr','art_'+i+'_url'); if(!ar)continue; var au=cellStr(ar[5]); if(!au)continue;
    var ad=fetchArticleData(au);
    var sPub=val('pr','art_'+i+'_pub','now'), sHead=val('pr','art_'+i+'_headline','now');
    var sDate=val('pr','art_'+i+'_date','now'), sImg=imgVal('pr','art_'+i+'_img');
    if(sPub)  ad.pub      = sPub;
    if(sHead) ad.headline = sHead;
    if(sDate) ad.date     = sDate;
    if(sImg)  ad.imgUrl   = sImg;
    ad.reach = val('pr','art_'+i+'_reach','now');
    ad.views = val('pr','art_'+i+'_views','now');
    ad.value = val('pr','art_'+i+'_value','now');
    ad.eng   = val('pr','art_'+i+'_eng','now');
    prA.push(ad);
  }

  var prP = [];
  for (var i=1;i<=4;i++) { var pr2=get('pr','pod_'+i+'_url'); if(!pr2)continue; var pu=cellStr(pr2[5]); if(!pu)continue; prP.push(fetchPodcastData(pu)); }

  var sKK = ['xFollowers','impressions','engagements','mutual','mutualScreenshot','discordMembers','telegram'];
  for (var i=1;i<=5;i++) sKK.push('post_'+i+'_url');

  var kKK = ['posts','smartFollowers','smartReach','smartCPM','growth','scoreImg','uniqueEngagers','mindPosts','quotePosts','impressions'].concat(kolPKK);
  var qKK = ['dau','signUps','walletsConnected','weeklyJoins','totalUsers','questCompletions','pointsIssued','numberOfPosts','note','screenshot_1','screenshot_2','screenshot_3','screenshot_4'];
  var collabPfps = [];
  for (var i = 1; i <= 15; i++) {
    var pr = get('collabs', 'pfp_' + i); if (!pr) continue;
    var pu = cellStr(pr[5]); if (!pu) continue;
    var prof = fetchTwitterProfile(pu, cellStr(pr[4]) || null);
    var pfpLabel = cellStr(pr[2]) || prof.authorName || '';
    var fl = prof.followersLabel || null;
    if (fl && fl.indexOf('X Followers') === -1) fl = fl + ' X Followers';
    collabPfps.push({ label: pfpLabel, avatar: prof.avatar || pu, followersLabel: fl });
  }
  var cKK = ['total','done','inProgress','raids'];
  for (var i = 1; i <= 15; i++) cKK.push('pfp_' + i);
  var ck3KK = ['score','uniqueEngagers','smartFollowers','avgViews','avgEngagement','smartEngagement','smartReach','screenshot'];
  var ncKK = ['contributors','posts','views','cpmViews','cpmPost','screenshot'];
  var nrKK = ['participants','aum','avgWalletHolding','avgWalletAge'];
  var prKK = ['placements','reach','views','value','engagement'];
  for (var i=1;i<=6;i++) prKK=prKK.concat(['art_'+i+'_url','art_'+i+'_pub','art_'+i+'_headline','art_'+i+'_date','art_'+i+'_img','art_'+i+'_reach','art_'+i+'_views','art_'+i+'_value','art_'+i+'_eng']);
  for (var i=1;i<=4;i++) prKK=prKK.concat(['pod_'+i+'_url','pod_'+i+'_platUrl','pod_'+i+'_title','pod_'+i+'_guest','pod_'+i+'_dur','pod_'+i+'_thumb']);

  return {
    client:        m('client')||'Client',
    clientLogo:    imgVal('meta','clientLogo'),
    banner:        imgVal('meta','banner'),
    pin:           m('pin')||'0000',
    published:     (m('published')||'').toUpperCase()==='Y',
    week:          parseNum(m('week'))||1,
    weekDate:      m('weekDate')||'',
    campaignStart: m('campaignStart')||'',
    lwLabel:       m('lwLabel')||null,
    nowLabel:      m('nowLabel')||null,

    overview: {
      followers:    trio('social','xFollowers'),
      discord:      trio('social','discordMembers'),
      cookie:       trio('cookie3','score'),
      collabs:      { lw:parseVal(val('collabs','total','lw')), now:parseVal(val('collabs','total','now')) },
      collabsTotal: { lw:parseVal(val('collabs','total','lw')), now:parseVal(val('collabs','total','now')) },
      totalUsers:   trio('quest','totalUsers')
    },

    social: (function() {
      if (!data.some(function(r){return r[0]==='social';})) return null;
      return {
        xFollowers:       trio('social','xFollowers'),
        impressions:      trio('social','impressions'),
        engagements:      trio('social','engagements'),
        mutual:           trio('social','mutual'),
        mutualScreenshot: imgVal('social','mutualScreenshot'),
        discordMembers:   trio('social','discordMembers'),
        telegram:         trio('social','telegram'),
        posts:            xPosts.length ? xPosts : null,
        extra:            extras('social', sKK)
      };
    })(),

    collabs: (function() {
      var d=val('collabs','done','now'), ip=val('collabs','inProgress','now'), ra=val('collabs','raids','now');
      if (!d&&!ip&&!ra&&!collabPfps.length) return null;
      return { done:d?parseNum(d):null, inProgress:ip?parseNum(ip):null, raids:ra?parseNum(ra):null, pfps:collabPfps.length?collabPfps:null, extra:extras('collabs',cKK) };
    })(),

    cookie3: (function() {
      if (!data.some(function(r){return r[0]==='cookie3';})) return null;
      return {
        score:          trio('cookie3','score'),
        uniqueEngagers: trio('cookie3','uniqueEngagers'),
        smartFollowers: trio('cookie3','smartFollowers'),
        avgViews:       trio('cookie3','avgViews'),
        avgEngagement:  trio('cookie3','avgEngagement'),
        smartEngagement:trio('cookie3','smartEngagement'),
        smartReach:     trio('cookie3','smartReach'),
        screenshot:     imgVal('cookie3','screenshot'),
        smart:          trio('cookie3','smartFollowers'),
        reach:          trio('cookie3','smartReach'),
        viewsPost:      trio('cookie3','avgViews'),
        engTweet:       trio('cookie3','avgEngagement'),
        extra:          extras('cookie3', ck3KK)
      };
    })(),

    quest: (function() {
      if (!data.some(function(r){return r[0]==='quest';})) return null;
      return {
        dau:              trio('quest','dau'),
        signUps:          trio('quest','signUps'),
        walletsConnected: trio('quest','walletsConnected'),
        weeklyJoins:      trio('quest','weeklyJoins'),
        totalUsers:       trio('quest','totalUsers'),
        questCompletions: trio('quest','questCompletions'),
        pointsIssued:     trio('quest','pointsIssued'),
        numberOfPosts:    trio('quest','numberOfPosts'),
        note:             val('quest','note','now'),
        screenshots:      qSS.length ? qSS : null,
        extra:            extras('quest',qKK)
      };
    })(),

    nucleusContrib: (function() {
      if (!data.some(function(r){return r[0]==='nucContrib';})) return null;
      return {
        contributors: trio('nucContrib','contributors'),
        posts:        trio('nucContrib','posts'),
        views:        trio('nucContrib','views'),
        cpmViews:     trio('nucContrib','cpmViews'),
        cpmPost:      trio('nucContrib','cpmPost'),
        screenshot:   imgVal('nucContrib','screenshot'),
        extra:        extras('nucContrib', ncKK)
      };
    })(),

    nucleusRep: (function() {
      if (!data.some(function(r){return r[0]==='nucRep';})) return null;
      return {
        participants:     trio('nucRep','participants'),
        aum:              trio('nucRep','aum'),
        avgWalletHolding: trio('nucRep','avgWalletHolding'),
        avgWalletAge:     trio('nucRep','avgWalletAge'),
        extra:            extras('nucRep', nrKK)
      };
    })(),

    kol: (function() {
      if (!data.some(function(r){return r[0]==='kol';})) return null;
      return {
        posts:          trio('kol','posts'),
        smartFollowers: trio('kol','smartFollowers'),
        smartReach:     trio('kol','smartReach'),
        smartCPM:       trio('kol','smartCPM'),
        growth:         trio('kol','growth'),
        scoreImg:       imgVal('kol','scoreImg'),
        mindshare: {
          uniqueEngagers: trio('kol','uniqueEngagers'),
          mindPosts:      trio('kol','mindPosts'),
          quotePosts:     trio('kol','quotePosts'),
          impressions:    trio('kol','impressions')
        },
        kolPosts: kolPosts.length ? kolPosts : null,
        extra:    extras('kol', kKK)
      };
    })(),

    pr: (function() {
      if (!data.some(function(r){return r[0]==='pr';})) return null;
      return {
        placements: val('pr','placements','now'),
        reach:      val('pr','reach','now'),
        views:      val('pr','views','now'),
        value:      val('pr','value','now'),
        engagement: val('pr','engagement','now'),
        articles:   prA.length ? prA : null,
        podcasts:   prP.length ? prP : null,
        extra:      extras('pr', prKK)
      };
    })(),

    finance: (function() {
      if (!data.some(function(r){return r[0]==='finance';})) return null;
      return { aum:trio('finance','aum'), extra:extras('finance',['aum']) };
    })(),

    website: (function() {
      if (!data.some(function(r){return r[0]==='website';})) return null;
      return { visits:trio('website','visits'), signups:trio('website','signups'), extra:extras('website',['visits','signups']) };
    })(),

    // ── Template compatibility aliases ──────────────────────────────────────────
    x: (function() {
      if (!data.some(function(r){return r[0]==='social';})) return null;
      return {
        followers:   trio('social','xFollowers'),
        impressions: trio('social','impressions'),
        engagements: trio('social','engagements'),
        verified:    null,
        mutual:      trio('social','mutual')
      };
    })(),

    discord: (function() {
      var m = trio('social','discordMembers');
      if (!m) return null;
      return { members: m, messages: null, topEngagers: [] };
    })(),

    growth: (function() {
      var collabsNow = parseVal(val('collabs','total','now'));
      var collabsLw  = parseVal(val('collabs','total','lw'));
      var dau        = trio('quest','dau');
      var reg        = trio('quest','totalUsers');
      if (!collabsNow && !dau && !reg) return null;
      return {
        collabs:    { lw: collabsLw, now: collabsNow },
        registered: reg,
        dau:        dau,
        mau:        null
      };
    })(),

    mindshare: (function() {
      if (!data.some(function(r){return r[0]==='kol';})) return null;
      return {
        uniqueEngagers: trio('kol','uniqueEngagers'),
        posts:          trio('kol','mindPosts'),
        quotePosts:     trio('kol','quotePosts'),
        impressions:    trio('kol','impressions')
      };
    })()
  };
}
