package cn.study.germanwords;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.content.pm.ActivityInfo;
import android.media.MediaPlayer;
import java.lang.reflect.Field;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Runs the real learning engine inside the target device's real WebView. */
public class SmokeInstrumentation extends Instrumentation {
    private MainActivity activity;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private String evaluate(String code) throws Exception {
        CountDownLatch ready=new CountDownLatch(1);
        AtomicReference<String> value=new AtomicReference<>();
        runOnMainSync(() -> activity.web.evaluateJavascript(code, result -> { value.set(result); ready.countDown(); }));
        if (!ready.await(10,TimeUnit.SECONDS)) throw new IOException("WebView callback timeout");
        return value.get();
    }
    @Override public void onStart() {
        Bundle results=new Bundle();
        File manifest=null;
        byte[] oldManifest=null;
        Set<String> initialSessions=new HashSet<>();
        int resultCode=Activity.RESULT_CANCELED;
        String oldPreferences=null;
        String oldTheme=null;
        String oldRate=null;
        try {
            Intent intent=new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity=(MainActivity)startActivitySync(intent);
            runOnMainSync(() -> activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            boolean loaded=false;
            for(int i=0;i<80;i++) {
                if("true".equals(evaluate("typeof currentFileWords !== 'undefined' && currentFileWords.length > 0"))) { loaded=true;break; }
                SystemClock.sleep(250);
            }
            if(!loaded) throw new IOException("Initial library did not load");
            UpdateChecks.run(activity);
            // A slow feedback request must not hold up file import/backup work.
            Field feedbackQueue=MainActivity.class.getDeclaredField("feedbackWorker");feedbackQueue.setAccessible(true);
            Field fileQueue=MainActivity.class.getDeclaredField("worker");fileQueue.setAccessible(true);
            CountDownLatch releaseFeedback=new CountDownLatch(1), filesReady=new CountDownLatch(1);
            ((java.util.concurrent.ExecutorService)feedbackQueue.get(activity)).execute(() -> {
                try { releaseFeedback.await(5,TimeUnit.SECONDS); } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            try {
                ((java.util.concurrent.ExecutorService)fileQueue.get(activity)).execute(filesReady::countDown);
                if(!filesReady.await(2,TimeUnit.SECONDS))throw new IOException("Feedback blocks file imports");
            } finally { releaseFeedback.countDown(); }

            JSONObject report=FeedbackSender.report(new JSONObject().put("versionName","test").put("versionCode",1).put("channel","beta")," test ","WebView test");
            if(!"test".equals(report.getString("message")) || report.length()!=5 || !report.getJSONObject("device").has("model") || report.getLong("submittedAtUnixMs")<=0)throw new IOException("Feedback metadata invalid");
            for(String invalid:new String[]{" ",new String(new char[4001]).replace('\0','x')}) {
                try { FeedbackSender.report(new JSONObject(),invalid,"test");throw new AssertionError("Invalid feedback accepted"); }
                catch(IOException expected) { }
            }
            oldTheme=evaluate("localStorage.getItem('german_theme_v1')");
            oldRate=evaluate("localStorage.getItem('german_playback_rate_v1')");
            AtomicReference<Boolean> focused=new AtomicReference<>(false);
            for(int i=0;i<80;i++) {
                runOnMainSync(() -> {activity.web.requestFocus();focused.set(activity.hasWindowFocus());});
                if(focused.get())break;
                SystemClock.sleep(250);
            }
            if(!focused.get())throw new IOException("App must be in the foreground for touch tests");
            String script;
            try(InputStream in=getContext().getAssets().open("smoke.js")) {
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                byte[] buffer=new byte[4096];int n;
                while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
                script=out.toString(StandardCharsets.UTF_8.name());
            }
            evaluate(script);
            String result="null";
            for(int i=0;i<240;i++) {
                result=evaluate("window.smokeResult || null");
                if(!"null".equals(result))break;
                SystemClock.sleep(250);
            }
            if(!result.contains("PASS"))throw new IOException("Engine device tests: "+result);
            oldPreferences=evaluate("localStorage.getItem(PREF_KEY)");
            evaluate("autoPlayEnabled=false;isFilterActive=false;switchView('card');document.getElementById('modeSelect').value='normal';changeMode()");
            evaluate("currentIndex=0;updateUI()");
            swipeCard();
            if(!"true".equals(evaluate("currentIndex===1")))throw new IOException("Physical card swipe did not advance");
            SystemClock.sleep(400);
            tapControl("btnNextCard");
            waitIndex(2);
            tapControl("btnPrevCard");
            waitIndex(1);
            dragProgress();
            if(!"true".equals(evaluate("currentIndex>=displayWords.length*.7 && currentIndex<=displayWords.length*.9 && preferences.books[currentFileName].word===displayWords[currentIndex].id")))throw new IOException("Physical progress drag did not navigate and persist");
            for(float scale:new float[]{1f,1.3f,1.5f,2f}) {
                runOnMainSync(() -> activity.applyTextScale(scale));
                evaluate("currentIndex=displayWords.reduce((longest,word,index)=>word.german.length>displayWords[longest].german.length?index:longest,0);updateUI()");
                SystemClock.sleep(300);
                if(!"true".equals(evaluate("(()=>{const word=document.getElementById('cardGerman');return word.scrollWidth<=word.clientWidth+1 && getComputedStyle(word).whiteSpace==='nowrap'})()")))throw new IOException("Longest word must fit on one line at zoom "+scale+" "+evaluate("(()=>{const word=document.getElementById('cardGerman');return JSON.stringify({text:word.textContent,width:word.clientWidth,scroll:word.scrollWidth,font:getComputedStyle(word).fontSize,inline:word.style.fontSize,parent:word.parentElement.clientWidth})})()"));
                if(!"true".equals(evaluate("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.main-content').scrollWidth<=innerWidth+1")))throw new IOException("Horizontal overflow at text zoom "+scale);
                if(!"true".equals(evaluate("document.body.scrollHeight<=innerHeight+1 && document.querySelector('.study-footer').getBoundingClientRect().bottom<=innerHeight+1 && document.getElementById('cardView').getBoundingClientRect().bottom<=innerHeight+1")))throw new IOException("Card or footer outside viewport at text zoom "+scale+" "+evaluate("JSON.stringify({h:innerHeight,body:document.body.scrollHeight,footer:document.querySelector('.study-footer').getBoundingClientRect().toJSON(),card:document.getElementById('cardView').getBoundingClientRect().toJSON()})"));
                if(!"true".equals(evaluate("(()=>{const card=document.querySelector('.card-body');return card.scrollHeight<=card.clientHeight+1})()")))throw new IOException("Built-in card requires scrolling at text zoom "+scale);
                if(!"true".equals(evaluate("[document.querySelector('.star-mark'),document.getElementById('pronounceIcon'),document.getElementById('btnPrevCard'),document.getElementById('btnNextCard')].every(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<=1 && r.width>=44})")))throw new IOException("Card buttons must remain circular at text zoom "+scale);
                if(!"true".equals(evaluate("(()=>{const card=document.getElementById('cardView').getBoundingClientRect(),body=document.querySelector('.card-body').getBoundingClientRect(),left=document.getElementById('btnPrevCard').getBoundingClientRect(),right=document.getElementById('btnNextCard').getBoundingClientRect();return left.left>=card.left && left.right<=body.left && right.left>=body.right && right.right<=card.right && left.top>=card.top && left.bottom<=card.bottom && right.top>=card.top && right.bottom<=card.bottom})()")))throw new IOException("Side buttons must stay inside the card without overlapping text at zoom "+scale);
                evaluate("document.getElementById('libraryButton').scrollIntoView({block:'nearest'});openLibrary()");
                if(scale==2f)screenshot("qa-library-200.png");
                if(!"true".equals(evaluate("libraryOpen && document.getElementById('library').scrollWidth<=innerWidth+1")))throw new IOException("Drawer at text zoom "+scale);
                evaluate("closeLibrary();document.getElementById('lessonTitle').scrollIntoView({block:'start'})");
                SystemClock.sleep(100);
                evaluate("Feedback.open()");
                if(!"true".equals(evaluate("document.getElementById('feedbackDescription').textContent==='请勿填写密码等敏感信息。'")))throw new IOException("Android feedback description must stay concise");
                if(!"true".equals(evaluate("document.getElementById('feedbackDialog').open && document.getElementById('feedbackDialog').scrollWidth<=document.getElementById('feedbackDialog').clientWidth+1")))throw new IOException("Feedback layout at text zoom "+scale);
                if(!"true".equals(evaluate("handleAndroidBack()")))throw new IOException("Feedback back did not close");
                screenshot("qa-font-"+Math.round(scale*100)+".png");
                evaluate("switchView('list');document.getElementById('modeSelect').value='test-zh';changeMode()");
                SystemClock.sleep(200);
                if(!"true".equals(evaluate("document.getElementById('wordTable').getBoundingClientRect().right<=innerWidth+1 && document.querySelector('#wordTable tbody tr').cells[0].textContent===''")))throw new IOException("Self-test list at text zoom "+scale);
                if(!"true".equals(evaluate("[...document.querySelectorAll('.pronounce-cell button')].every(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<=1})")))throw new IOException("List buttons must remain circular at text zoom "+scale);
                if(scale==2f)screenshot("qa-list-200.png");
                evaluate("switchView('card');document.getElementById('modeSelect').value='normal';changeMode()");
            }
            runOnMainSync(() -> activity.web.setLayoutParams(new android.widget.FrameLayout.LayoutParams(
                    Math.round(320*activity.getResources().getDisplayMetrics().density),android.widget.FrameLayout.LayoutParams.MATCH_PARENT)));
            for(float scale:new float[]{1f,2f}) {
                runOnMainSync(() -> activity.applyTextScale(scale));SystemClock.sleep(300);
                SystemClock.sleep(100);
                if(!"true".equals(evaluate("innerWidth<=321 && document.querySelector('.main-content').scrollWidth<=innerWidth+1 && document.querySelector('.study-footer').getBoundingClientRect().bottom<=innerHeight+1")))throw new IOException("320dp card layout at text zoom "+scale);
                if(!"true".equals(evaluate("(()=>{const word=document.getElementById('cardGerman');return word.scrollWidth<=word.clientWidth+1 && getComputedStyle(word).whiteSpace==='nowrap'})()")))throw new IOException("320dp longest word must fit on one line at zoom "+scale);
                evaluate("switchView('list');document.getElementById('modeSelect').value='test-de';changeMode()");
                if(!"true".equals(evaluate("document.getElementById('wordTable').getBoundingClientRect().right<=innerWidth+1")))throw new IOException("320dp list layout at text zoom "+scale);
                evaluate("switchView('card');document.getElementById('modeSelect').value='normal';changeMode()");
            }
            runOnMainSync(() -> activity.web.setLayoutParams(new android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT,android.widget.FrameLayout.LayoutParams.MATCH_PARENT)));
            runOnMainSync(() -> activity.applyTextScale(activity.getResources().getConfiguration().fontScale));
            evaluate("AppTheme.setMode('light');AppTheme.setSystemDark(true)");
            if(!"true".equals(evaluate("document.documentElement.dataset.theme==='light' && document.getElementById('themeSelect').value==='light'")))throw new IOException("Manual light theme must override the system");
            evaluate("AppTheme.setMode('dark');AppTheme.setSystemDark(false)");
            if(!"true".equals(evaluate("document.documentElement.dataset.theme==='dark' && localStorage.getItem('german_theme_v1')==='dark'")))throw new IOException("Manual dark theme must persist and override the system");
            AtomicReference<Integer> barFlags=new AtomicReference<>(0);
            runOnMainSync(() -> barFlags.set(activity.getWindow().getDecorView().getSystemUiVisibility()));
            if((barFlags.get() & android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)!=0)throw new IOException("Dark theme must update native system bar icons");
            screenshot("qa-theme-dark.png");
            evaluate("AppTheme.setMode('auto');AppTheme.setSystemDark(true)");
            if(!"true".equals(evaluate("document.documentElement.dataset.theme==='dark'")))throw new IOException("Auto theme must follow dark system");
            evaluate("AppTheme.setSystemDark(false)");
            if(!"true".equals(evaluate("document.documentElement.dataset.theme==='light'")))throw new IOException("Auto theme must follow light system");
            runOnMainSync(() -> activity.onConfigurationChanged(activity.getResources().getConfiguration()));
            if(!"true".equals(evaluate("document.documentElement.dataset.theme===(Android.isSystemDark()?'dark':'light')")))throw new IOException("Configuration changes must resync the actual Android theme");
            // Real native MediaPlayer must prepare and play a packaged recording.
            evaluate("pauseStudyAudio(); changePlaybackRate(0.75); Android.play(audioSource(displayWords[0]).url); true");
            Field field=MainActivity.class.getDeclaredField("player");field.setAccessible(true);
            AtomicReference<Boolean> playing=new AtomicReference<>(false);
            for(int i=0;i<40;i++) {
                runOnMainSync(() -> {try {MediaPlayer p=(MediaPlayer)field.get(activity);playing.set(p!=null && p.isPlaying());}catch(Exception ignored){}});
                if(playing.get())break;
                SystemClock.sleep(50);
            }
            if(!playing.get())throw new IOException("Native MediaPlayer did not play packaged audio");
            AtomicReference<Float> speed=new AtomicReference<>(0f);
            runOnMainSync(() -> {try {speed.set(((MediaPlayer)field.get(activity)).getPlaybackParams().getSpeed());}catch(Exception ignored){}});
            if(Math.abs(speed.get()-0.75f)>.01f)throw new IOException("Native playback rate not applied");
            evaluate("changePlaybackRate(1.25)");
            runOnMainSync(() -> {try {speed.set(((MediaPlayer)field.get(activity)).getPlaybackParams().getSpeed());}catch(Exception ignored){}});
            if(Math.abs(speed.get()-1.25f)>.01f)throw new IOException("Active native playback rate not updated");
            evaluate("pauseStudyAudio()");
            manifest=new File(activity.getFilesDir(),"import-manifest.json");
            if(manifest.exists())oldManifest=readFile(manifest);
            File library=new File(activity.getFilesDir(),"library");
            File[] oldSessions=library.listFiles();
            if(oldSessions!=null)for(File file:oldSessions)initialSessions.add(file.getName());
            Uri tree=DocumentsContract.buildTreeDocumentUri(FixtureDocumentsProvider.AUTHORITY,"root");
            runOnMainSync(() -> activity.onActivityResult(MainActivity.FOLDER,Activity.RESULT_OK,new Intent().setData(tree)));
            waitImported("SAF-Test.xlsx");
            android.util.Log.d("GermanWordsTest","Folder imported");
            if(!"true".equals(evaluate("currentFileWords.length===65 && fileMap[currentFileName].url.includes('/library/')")))throw new IOException("Folder import failed");
            if(!"true".equals(evaluate("findAudioFile(currentFileWords.find(w=>w.german==='lernen')).url.includes('/library/')")))throw new IOException("Nested imported recording not matched");
            evaluate("Android.play(findAudioFile(currentFileWords.find(w=>w.german==='lernen')).url)");
            playing.set(false);
            for(int i=0;i<40;i++) {
                runOnMainSync(() -> {try {MediaPlayer p=(MediaPlayer)field.get(activity);playing.set(p!=null && p.isPlaying());}catch(Exception ignored){}});
                if(playing.get())break;SystemClock.sleep(50);
            }
            if(!playing.get())throw new IOException("Imported recording did not play");
            evaluate("pauseStudyAudio()");
            Uri single=DocumentsContract.buildDocumentUri(FixtureDocumentsProvider.AUTHORITY,"file");
            runOnMainSync(() -> activity.onActivityResult(MainActivity.FILES,Activity.RESULT_OK,new Intent().setData(single)));
            waitImported("Individual-Test.xlsx");
            android.util.Log.d("GermanWordsTest","Individual file imported");
            if(!"true".equals(evaluate("currentFileWords.length===65")))throw new IOException("Individual file import failed");
            runOnMainSync(() -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            android.util.Log.d("GermanWordsTest","Landscape requested");
            for(int i=0;i<40;i++){if("true".equals(evaluate("innerWidth>innerHeight")))break;SystemClock.sleep(100);}
            if(!"true".equals(evaluate("innerWidth>innerHeight && document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.study-footer').getBoundingClientRect().bottom<=innerHeight+1")))throw new IOException("Landscape layout");
            runOnMainSync(() -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
            android.util.Log.d("GermanWordsTest","Landscape verified");
            results.putString("stream", "\n"+result+"\nPASS: physical swipe/progress drag, 100/130/150/200% single-screen layout/circular controls, 320dp, themes/system bars, native audio with live 0.75x/1.25x speed, SAF import and landscape.\n");
            resultCode=Activity.RESULT_OK;
        } catch(Exception e) {
            results.putString("stream", "\nFAIL: "+e+"\n");
        } finally {
            if(activity!=null && oldRate!=null)try {
                evaluate("changePlaybackRate("+("null".equals(oldRate)?"1":oldRate)+");"+("null".equals(oldRate)?"localStorage.removeItem('german_playback_rate_v1')":"localStorage.setItem('german_playback_rate_v1',"+oldRate+")"));
            }catch(Exception ignored){}
            if(activity!=null && oldTheme!=null)try {
                evaluate("AppTheme.setMode("+("null".equals(oldTheme)?"'auto'":oldTheme)+");"+("null".equals(oldTheme)?"localStorage.removeItem('german_theme_v1')":"localStorage.setItem('german_theme_v1',"+oldTheme+")")+";syncSystemTheme()");
            }catch(Exception ignored){}
            if(activity!=null && manifest!=null) {
                try {
                    if(oldManifest==null)manifest.delete();else try(FileOutputStream out=new FileOutputStream(manifest)){out.write(oldManifest);}
                    File[] sessions=new File(activity.getFilesDir(),"library").listFiles();
                    if(sessions!=null)for(File file:sessions)if(!initialSessions.contains(file.getName()))remove(file);
                }catch(Exception ignored){}
            }
            if(activity!=null && oldPreferences!=null)try {
                evaluate("pauseStudyAudio();"+("null".equals(oldPreferences)?"localStorage.removeItem(PREF_KEY)":"localStorage.setItem(PREF_KEY,"+oldPreferences+")")+";preferences=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');applyPreferences();reloadLibrary()");
            }catch(Exception ignored){}
            if(activity!=null)runOnMainSync(() -> {
                activity.web.setLayoutParams(new android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT,android.widget.FrameLayout.LayoutParams.MATCH_PARENT));
                activity.applyTextScale(activity.getResources().getConfiguration().fontScale);
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            });
        }
        finish(resultCode,results);
    }
    private byte[] readFile(File file) throws IOException {
        try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);return out.toByteArray();
        }
    }
    private void screenshot(String name) throws IOException {
        SystemClock.sleep(250);
        android.graphics.Bitmap bitmap=getUiAutomation().takeScreenshot();
        if(bitmap==null)throw new IOException("Screenshot unavailable");
        File directory=new File(activity.getCacheDir(),"test-screenshots");
        if(!directory.isDirectory() && !directory.mkdirs())throw new IOException("Cannot create test screenshot directory");
        try(OutputStream out=new FileOutputStream(new File(directory,name))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
        finally {bitmap.recycle();}
    }
    private void swipeCard() throws Exception {
        waitForIdleSync();
        SystemClock.sleep(200);
        int[] location=new int[2];
        runOnMainSync(() -> activity.web.getLocationOnScreen(location));
        float start=location[0]+activity.web.getWidth()*.8f;
        float end=location[0]+activity.web.getWidth()*.2f;
        float y=location[1]+activity.web.getHeight()*.6f;
        drag(start,end,y);
    }
    private void dragProgress() throws Exception {
        int[] location=new int[2];
        runOnMainSync(() -> activity.web.getLocationOnScreen(location));
        float scale=activity.web.getWidth()/Float.parseFloat(evaluate("innerWidth"));
        float y=location[1]+Float.parseFloat(evaluate("(()=>{const r=document.getElementById('studyProgress').getBoundingClientRect();return r.top+r.height/2})()"))*scale;
        float left=Float.parseFloat(evaluate("document.getElementById('studyProgress').getBoundingClientRect().left"));
        float width=Float.parseFloat(evaluate("document.getElementById('studyProgress').getBoundingClientRect().width"));
        evaluate("window.progressOriginalPlay=playPronounce;window.progressOldAutoPlay=autoPlayEnabled;autoPlayEnabled=true;window.progressPlays=0;playPronounce=()=>progressPlays++");
        try {
            drag(location[0]+(left+width*.2f)*scale,location[0]+(left+width*.8f)*scale,y,true);
            if(!"true".equals(evaluate("progressPlays===1")))throw new IOException("Release must play only the final preview word");
        } finally { evaluate("playPronounce=window.progressOriginalPlay;autoPlayEnabled=window.progressOldAutoPlay"); }
    }
    private void waitIndex(int expected) throws Exception {
        for(int i=0;i<30;i++) {
            if(String.valueOf(expected).equals(evaluate("currentIndex")))return;
            SystemClock.sleep(50);
        }
        screenshot("qa-failure.png");
        throw new IOException("Button expected index "+expected+", state "+evaluate("JSON.stringify({index:currentIndex,count:displayWords.length,disabled:document.getElementById('btnNextCard').disabled,focus:document.hasFocus()})"));
    }
    private void tapControl(String id) throws Exception {
        int[] location=new int[2];runOnMainSync(() -> activity.web.getLocationOnScreen(location));
        float scale=activity.web.getWidth()/Float.parseFloat(evaluate("innerWidth"));
        float x=Float.parseFloat(evaluate("(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return r.left+r.width/2})()"))*scale+location[0];
        float y=Float.parseFloat(evaluate("(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return r.top+r.height/2})()"))*scale+location[1];
        try(InputStream result=new android.os.ParcelFileDescriptor.AutoCloseInputStream(
                getUiAutomation().executeShellCommand("input tap "+Math.round(x)+" "+Math.round(y)))) {
            while(result.read()!=-1) { }
        }
    }
    private void drag(float start,float end,float y) throws Exception {
        drag(start,end,y,false);
    }
    private void drag(float start,float end,float y,boolean progress) throws Exception {
        long down=SystemClock.uptimeMillis();
        for(int i=0;i<=12;i++) {
            int action=i==0?android.view.MotionEvent.ACTION_DOWN:i==12?android.view.MotionEvent.ACTION_UP:android.view.MotionEvent.ACTION_MOVE;
            android.view.MotionEvent event=android.view.MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,start+(end-start)*i/12,y,0);
            event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
            getUiAutomation().injectInputEvent(event,true);
            event.recycle();
            SystemClock.sleep(20);
            if(progress && i==10) {
                SystemClock.sleep(180);
                if(!"true".equals(evaluate("progressPlays===0 && autoPlayTimer===null && currentAudio===null && currentIndex>displayWords.length*.6 && document.getElementById('cardChinese').innerText===displayWords[currentIndex].chinese")))throw new IOException("Held slider must preview the target card without audio");
            }
        }
        SystemClock.sleep(150);
    }
    private void waitImported(String name) throws Exception {
        for(int i=0;i<100;i++) {
            if("true".equals(evaluate("!importBusy && currentFileName==="+JSONObject.quote(name))))return;
            SystemClock.sleep(100);
        }
        throw new IOException("Import timeout: "+name+"; "+evaluate("document.getElementById('notice').innerText"));
    }
    private void remove(File file) { File[] children=file.listFiles();if(children!=null)for(File child:children)remove(child);file.delete(); }
}
